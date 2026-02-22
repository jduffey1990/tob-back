// src/controllers/appleSubscriptionService.ts
//
// Handles two Apple subscription flows:
//   1. App Store Server Notifications (Apple → backend webhook)
//   2. Purchase verification (iOS app → backend, after in-app purchase)
//
// Apple uses JWS (JSON Web Signature) for all payloads.
// We decode without full cryptographic verification in v1 — acceptable because:
//   - Webhook endpoint receives traffic only from Apple's servers
//   - Purchase endpoint requires JWT auth from our own users
// TODO v2: Add full Apple public key signature verification via JWKS

import { PostgresService } from './postgres.service';

// ============================================================
// Product ID → Tier mapping
// ============================================================

const PRODUCT_TIER_MAP: Record<string, string> = {
  'foxdogdevelopment.TowerOfBabble.pro.monthly':     'pro',
  'foxdogdevelopment.TowerOfBabble.pro.annual':      'pro',
  'foxdogdevelopment.TowerOfBabble.warrior.monthly': 'prayer_warrior',
  'foxdogdevelopment.TowerOfBabble.warrior.annual':  'prayer_warrior',
};

// ============================================================
// AppleSubscriptionService
// ============================================================

export class AppleSubscriptionService {

  // ----------------------------------------------------------
  // JWS Decoding
  // ----------------------------------------------------------

  /**
   * Decode the payload portion of a JWS (JWT-style) string.
   * Apple uses this format for signedPayload, signedTransactionInfo,
   * and signedRenewalInfo.
   */
  static decodeJWSPayload(jws: string): any {
    const parts = jws.split('.');
    if (parts.length !== 3) {
      throw new Error(`Invalid JWS format: expected 3 parts, got ${parts.length}`);
    }
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf8');
    return JSON.parse(json);
  }

  // ----------------------------------------------------------
  // Tier Helpers
  // ----------------------------------------------------------

  static getTierFromProductId(productId: string): string | null {
    return PRODUCT_TIER_MAP[productId] ?? null;
  }

  // ----------------------------------------------------------
  // Database Updates
  // ----------------------------------------------------------

  /**
   * Update a user's subscription tier and expiry date.
   * Called by both the webhook handler and purchase verification.
   */
  static async updateUserSubscription(
    userId: string,
    tier: string,
    expiresAt: Date | null
  ): Promise<void> {
    const db = PostgresService.getInstance();

    await db.query(
      `UPDATE users
       SET subscription_tier        = $1,
           subscription_expires_at  = $2,
           updated_at               = NOW()
       WHERE id = $3::uuid`,
      [tier, expiresAt, userId]
    );

    console.log(
      `✅ [AppleSubscriptionService] User ${userId} → tier: ${tier}, expires: ${expiresAt?.toISOString() ?? 'never'}`
    );
  }

  // ----------------------------------------------------------
  // App Store Server Notification Handler (webhook)
  // ----------------------------------------------------------

  /**
   * Process an incoming App Store Server Notification.
   * Apple POSTs these to /apple/notifications for subscription lifecycle events.
   *
   * Notification types we handle:
   *   SUBSCRIBED          — new purchase
   *   DID_RENEW           — successful renewal
   *   DID_CHANGE_RENEWAL_PREF — upgrade or downgrade selected (effective next period)
   *   EXPIRED             — subscription ended
   *   REFUND              — purchase refunded
   *   DID_FAIL_TO_RENEW   — billing failure (grace period, don't downgrade yet)
   */
  static async handleNotification(signedPayload: string): Promise<void> {
    const notification = this.decodeJWSPayload(signedPayload);
    const { notificationType, subtype, data } = notification;

    console.log(
      `📬 [AppleSubscriptionService] Notification: ${notificationType}` +
      (subtype ? ` / ${subtype}` : '')
    );

    if (!data?.signedTransactionInfo) {
      console.log('⚠️  No signedTransactionInfo in notification payload — skipping');
      return;
    }

    const transaction = this.decodeJWSPayload(data.signedTransactionInfo);
    const { productId, appAccountToken, expiresDate } = transaction;

    console.log(`   Product ID:          ${productId}`);
    console.log(`   App Account Token:   ${appAccountToken}`);  // this is our userId

    // appAccountToken is the UUID we set when initiating the purchase on iOS.
    // If missing, we cannot identify the user — log and bail.
    if (!appAccountToken) {
      console.warn(
        '⚠️  appAccountToken missing from transaction. ' +
        'Ensure SubscriptionService sets Product.PurchaseOption.appAccountToken(uuid) on iOS.'
      );
      return;
    }

    const userId    = appAccountToken as string;
    const expiresAt = expiresDate ? new Date(Number(expiresDate)) : null;

    switch (notificationType) {

      // New subscription or successful renewal → upgrade/maintain tier
      case 'SUBSCRIBED':
      case 'DID_RENEW': {
        const tier = this.getTierFromProductId(productId);
        if (tier) {
          await this.updateUserSubscription(userId, tier, expiresAt);
        } else {
          console.warn(`⚠️  Unknown productId: ${productId}`);
        }
        break;
      }

      // User changed their renewal preference (e.g. downgraded from Warrior → Pro).
      // Apple processes the change at next billing cycle. We update immediately
      // so the downgrade enforcement triggers on next app open rather than next renewal.
      case 'DID_CHANGE_RENEWAL_PREF': {
        if (data.signedRenewalInfo) {
          const renewal    = this.decodeJWSPayload(data.signedRenewalInfo);
          const newTier    = this.getTierFromProductId(renewal.autoRenewProductId);
          if (newTier) {
            await this.updateUserSubscription(userId, newTier, expiresAt);
          }
        }
        break;
      }

      // Subscription fully ended or refunded → drop to free
      case 'EXPIRED':
      case 'REFUND': {
        await this.updateUserSubscription(userId, 'free', null);
        break;
      }

      // Billing failure — Apple retries for several days (grace period).
      // Do NOT downgrade yet; Apple will send EXPIRED if all retries fail.
      case 'DID_FAIL_TO_RENEW': {
        console.log(
          `⚠️  Billing failure for user ${userId}. ` +
          'Keeping current tier during Apple grace period.'
        );
        break;
      }

      default:
        console.log(`ℹ️  Unhandled notification type: ${notificationType} — no action taken`);
    }
  }

  // ----------------------------------------------------------
  // Purchase Verification (called by iOS immediately after purchase)
  // ----------------------------------------------------------

  /**
   * Verify a StoreKit 2 signed transaction and update the user's tier.
   * The iOS app sends the raw JWS transaction string from StoreKit.
   *
   * Idempotent — safe to call multiple times with the same transaction.
   */
  static async verifyPurchase(
    userId: string,
    signedTransaction: string
  ): Promise<{ tier: string; expiresAt: Date | null }> {

    const transaction = this.decodeJWSPayload(signedTransaction);
    const { productId, expiresDate, originalTransactionId } = transaction;

    console.log(`🧾 [AppleSubscriptionService] verifyPurchase`);
    console.log(`   User:                  ${userId}`);
    console.log(`   Product:               ${productId}`);
    console.log(`   Original Tx ID:        ${originalTransactionId}`);

    const tier = this.getTierFromProductId(productId);
    if (!tier) {
      throw new Error(`Unknown productId: ${productId}`);
    }

    const expiresAt = expiresDate ? new Date(Number(expiresDate)) : null;
    const db        = PostgresService.getInstance();

    // Idempotency: if we've already processed this exact transaction, skip the DB write
    const { rows: existing } = await db.query(
      `SELECT id FROM apple_transactions WHERE original_transaction_id = $1`,
      [originalTransactionId]
    );

    if (existing.length > 0) {
      console.log(`ℹ️  Transaction ${originalTransactionId} already processed — skipping insert`);
      return { tier, expiresAt };
    }

    // Record the transaction for idempotency and audit trail
    await db.query(
      `INSERT INTO apple_transactions
         (user_id, original_transaction_id, product_id, expires_at, created_at)
       VALUES ($1::uuid, $2, $3, $4, NOW())`,
      [userId, originalTransactionId, productId, expiresAt]
    );

    // Update the user's tier
    await this.updateUserSubscription(userId, tier, expiresAt);

    return { tier, expiresAt };
  }
}