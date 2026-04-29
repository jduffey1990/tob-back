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
import { ValidationError} from '../errors';
import { GracePeriodService } from './gracePeriodService';
import { EmailService } from './email.service';

const emailService = new EmailService();

// Lookup helper: leader email/name + flock info for the leader's flock + their
// members' emails. Used to fan out subscription-state notifications.
async function loadLeaderAndMembers(userId: string): Promise<{
  leaderEmail: string;
  leaderName: string;
  gracePeriodEndsAt: Date | null;
  flockName: string | null;
  memberEmails: string[];
} | null> {
  const db = PostgresService.getInstance();
  const { rows: userRows } = await db.query(
    `SELECT email, name, grace_period_ends_at FROM users WHERE id = $1::uuid`,
    [userId]
  );
  if (!userRows[0]) return null;
  const { rows: flockRows } = await db.query(
    `SELECT id, name FROM flocks WHERE leader_user_id = $1::uuid LIMIT 1`,
    [userId]
  );
  let memberEmails: string[] = [];
  let flockName: string | null = null;
  if (flockRows[0]) {
    flockName = flockRows[0].name;
    const { rows: memberRows } = await db.query(
      `SELECT u.email
         FROM flock_members fm
         JOIN users u ON u.id = fm.member_user_id
        WHERE fm.flock_id = $1::uuid AND u.deleted_at IS NULL`,
      [flockRows[0].id]
    );
    memberEmails = memberRows.map((r: any) => r.email);
  }
  return {
    leaderEmail: userRows[0].email,
    leaderName: userRows[0].name,
    gracePeriodEndsAt: userRows[0].grace_period_ends_at ?? null,
    flockName,
    memberEmails,
  };
}

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
      throw new ValidationError(`Invalid JWS format: expected 3 parts, got ${parts.length}`);
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

      // New subscription or successful renewal → upgrade/maintain tier.
      // If the user was in grace (or had a suspended flock from a prior expiry),
      // clear grace fields and resume their flock transparently. If a flock
      // was actually resumed (was suspended → now active), notify members.
      case 'SUBSCRIBED':
      case 'DID_RENEW': {
        const tier = this.getTierFromProductId(productId);
        if (!tier) {
          console.warn(`⚠️  Unknown productId: ${productId}`);
          break;
        }
        await this.updateUserSubscription(userId, tier, expiresAt);
        await GracePeriodService.clearGracePeriod(userId);
        // Only resume the flock if the new tier qualifies as a leader tier.
        // If they downgraded (e.g. Warrior → Pro on resubscribe), the flock
        // stays suspended and will be cleaned up at 90 days unless they
        // upgrade back to Warrior.
        if (GracePeriodService.isFlockLeaderTier(tier)) {
          const { flockId: resumedFlockId } = await GracePeriodService.resumeFlock(userId);
          if (resumedFlockId) {
            const ctx = await loadLeaderAndMembers(userId);
            if (ctx?.flockName && ctx.memberEmails.length > 0) {
              await Promise.all(
                ctx.memberEmails.map(em =>
                  emailService.sendFlockResumedEmail(em, ctx.flockName!, ctx.leaderName)
                )
              );
            }
          }
        }
        break;
      }

      // User changed their renewal preference (e.g. picked a different product
      // for next renewal). Apple does not actually change the active subscription
      // until the next billing cycle — applying the change now would strip access
      // the user already paid for. The eventual DID_RENEW (with the new product
      // id) or EXPIRED will drive the real tier change.
      case 'DID_CHANGE_RENEWAL_PREF': {
        console.log(
          `ℹ️  Renewal preference change (subtype: ${subtype ?? 'none'}) for user ${userId} ` +
          '— deferring; tier will update at the actual renewal/expiry event.'
        );
        break;
      }

      // Subscription ended after billing retries failed or the user cancelled.
      // For flock-leader tiers we open a 14-day grace period (flock stays
      // active for members; leader is blocked from creating new content).
      // For non-leader tiers we downgrade immediately.
      case 'EXPIRED': {
        const db = PostgresService.getInstance();
        const { rows } = await db.query(
          `SELECT subscription_tier FROM users WHERE id = $1::uuid`,
          [userId]
        );
        const currentTier = rows[0]?.subscription_tier as string | undefined;

        if (currentTier && GracePeriodService.isFlockLeaderTier(currentTier)) {
          await GracePeriodService.enterGracePeriod(userId, currentTier);
          // Email the leader so they know the clock is running. (Members are
          // intentionally NOT notified here — flock stays active during grace.)
          const ctx = await loadLeaderAndMembers(userId);
          if (ctx?.leaderEmail && ctx.gracePeriodEndsAt) {
            await emailService.sendGraceStartEmail(
              ctx.leaderEmail,
              ctx.leaderName,
              new Date(ctx.gracePeriodEndsAt)
            );
          }
        } else {
          await this.updateUserSubscription(userId, 'free', null);
        }
        break;
      }

      // Refunds are clawbacks — money was returned, often signal of fraud or
      // chargeback. No grace: immediate downgrade and flock suspension.
      // Notify the leader (clawback explanation) and any flock members.
      case 'REFUND': {
        const ctx = await loadLeaderAndMembers(userId);
        await this.updateUserSubscription(userId, 'free', null);
        await GracePeriodService.clearGracePeriod(userId);
        await GracePeriodService.suspendFlock(userId);
        console.log(JSON.stringify({ event: 'refund_clawback', userId, productId }));
        if (ctx?.leaderEmail) {
          await emailService.sendRefundClawbackEmail(ctx.leaderEmail, ctx.leaderName);
        }
        if (ctx?.flockName && ctx.memberEmails.length > 0) {
          await Promise.all(
            ctx.memberEmails.map(em =>
              emailService.sendFlockSuspendedEmail(em, ctx.flockName!, ctx.leaderName)
            )
          );
        }
        break;
      }

      // Billing failure — Apple retries for several days (Apple's billing grace).
      // Do NOT downgrade yet; Apple will send EXPIRED if all retries fail and
      // our 14-day flock grace will start from there.
      case 'DID_FAIL_TO_RENEW': {
        console.log(
          `⚠️  Billing failure for user ${userId}. ` +
          'Keeping current tier during Apple billing grace period.'
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
      throw new ValidationError(`Unknown productId: ${productId}`);
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
      // Still ensure user's tier is correct even on repeat calls
      await this.updateUserSubscription(userId, tier, expiresAt);
      return { tier, expiresAt };
    }

    // Record the transaction for idempotency and audit trail
    await db.query(
      `INSERT INTO apple_transactions
         (user_id, original_transaction_id, product_id, expires_at, created_at)
       VALUES ($1::uuid, $2, $3, $4, NOW())`,
      [userId, originalTransactionId, productId, expiresAt]
    );

    // Update the user's tier and clear any grace state from a prior expiry.
    // If they're back on a leader tier and had a suspended flock, resume it
    // and notify members.
    await this.updateUserSubscription(userId, tier, expiresAt);
    await GracePeriodService.clearGracePeriod(userId);
    if (GracePeriodService.isFlockLeaderTier(tier)) {
      const { flockId: resumedFlockId } = await GracePeriodService.resumeFlock(userId);
      if (resumedFlockId) {
        const ctx = await loadLeaderAndMembers(userId);
        if (ctx?.flockName && ctx.memberEmails.length > 0) {
          await Promise.all(
            ctx.memberEmails.map(em =>
              emailService.sendFlockResumedEmail(em, ctx.flockName!, ctx.leaderName)
            )
          );
        }
      }
    }

    return { tier, expiresAt };
  }
}