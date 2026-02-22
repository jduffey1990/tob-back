// src/routes/appleRoutes.ts
//
// Two endpoints for Apple subscription management:
//
//   POST /apple/notifications      — App Store Server Notifications webhook (no auth)
//   POST /subscription/verify-purchase — iOS calls this after in-app purchase (JWT auth)

import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { AppleSubscriptionService } from '../controllers/appleSubscriptionService';
import type { UserSafe } from '../models/user';

export const appleRoutes: ServerRoute[] = [

  // ============================================================
  // POST /apple/notifications
  // App Store Server Notifications — Apple calls this webhook
  // whenever a subscription event occurs (purchase, renewal,
  // downgrade, cancellation, expiry, refund, billing failure).
  //
  // Auth: none (Apple sends this server-to-server)
  // Register this URL in App Store Connect → App Information →
  // "URL for App Store Server Notifications"
  // ============================================================
  {
    method: 'POST',
    path: '/apple/notifications',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const payload = request.payload as { signedPayload?: string };

        if (!payload?.signedPayload) {
          console.warn('⚠️  Apple notification received with no signedPayload');
          // Still return 200 — returning 4xx causes Apple to retry aggressively
          return h.response({ received: true }).code(200);
        }

        // Process asynchronously — we must respond to Apple quickly
        await AppleSubscriptionService.handleNotification(payload.signedPayload);

        return h.response({ received: true }).code(200);

      } catch (error: any) {
        console.error('❌ Apple notification processing error:', error.message);
        // Return 200 even on error — if we return 5xx Apple retries repeatedly.
        // Errors are logged to CloudWatch for investigation.
        return h.response({ received: true }).code(200);
      }
    },
    options: {
      auth: false,
      description: 'App Store Server Notifications webhook (Apple → backend)',
      tags: ['api', 'apple', 'subscriptions']
    }
  },

  // ============================================================
  // POST /subscription/verify-purchase
  // Called by the iOS app immediately after a successful StoreKit 2
  // purchase. The app sends the raw signed JWS transaction from Apple.
  // We decode it, map the productId to a tier, and update the user's
  // subscription in the database.
  //
  // Auth: JWT (user must be logged in)
  // ============================================================
  {
    method: 'POST',
    path: '/subscription/verify-purchase',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const payload  = request.payload as { signedTransaction?: string };

        if (!payload?.signedTransaction) {
          return h.response({ error: 'signedTransaction is required' }).code(400);
        }

        const result = await AppleSubscriptionService.verifyPurchase(
          authUser.id,
          payload.signedTransaction
        );

        return h.response({
          success:   true,
          tier:      result.tier,
          expiresAt: result.expiresAt?.toISOString() ?? null,
          message:   `Subscription updated to ${result.tier}`
        }).code(200);

      } catch (error: any) {
        console.error('❌ Purchase verification error:', error.message);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Verify StoreKit 2 purchase and update subscription tier',
      tags: ['api', 'apple', 'subscriptions']
    }
  }
];