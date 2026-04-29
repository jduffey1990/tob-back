// src/controllers/gracePeriodService.ts
//
// State machine for the 14-day post-expiry grace period and flock suspension.
//
// Design summary:
//   - When a flock-leader subscription EXPIRES, the user enters a 14-day grace period:
//       * subscription_tier stays at the snapshot value (e.g. 'prayer_warrior')
//       * grace_period_ends_at is set to now + 14 days
//       * grace_tier_snapshot records the tier at expiry (defensive copy)
//       * The flock stays 'active' so members see no immediate change
//   - During grace: leader can manage existing flock content but cannot CREATE
//     new prayers, pray-on-its, AI generations, flock prayers, or playlists.
//     This is the anti-abuse block — see assertCanCreateContent().
//   - If they resubscribe within grace: grace fields cleared transparently,
//     flock status stays active, members unaware. Handled in the SUBSCRIBED path.
//   - If grace expires: subscription_tier flips to 'free', grace fields cleared,
//     flock flips to 'suspended', members get a "flock paused" email.
//   - If they resubscribe after suspension: flock resumes, members get a
//     "flock resumed" email.
//   - If a flock stays 'suspended' for 90 days: hard-deleted by the daily cron,
//     members get a "flock archived" email. flock_members rows cascade.

import { PostgresService } from './postgres.service';
import { LimitReachedError, NotFoundError } from '../errors';
import type { UserSafe } from './userService';

const GRACE_PERIOD_DAYS = 14;
const SHIPWRECK_CLEANUP_DAYS = 90;
const FLOCK_LEADER_TIERS = ['prayer_warrior', 'lifetime'];

export class GracePeriodService {

  // ============================================
  // Predicates
  // ============================================

  /**
   * Resolve the tier a user should be evaluated against. During grace the
   * subscription_tier column is preserved at its pre-expiry value, so this
   * is currently a thin pass-through — but callers should use this rather
   * than reading subscriptionTier directly so future design changes have
   * one place to land.
   */
  static getEffectiveTier(user: Pick<UserSafe, 'subscriptionTier'>): string {
    return user.subscriptionTier;
  }

  /** True if the user is inside their 14-day post-expiry grace window. */
  static isInGracePeriod(user: Pick<UserSafe, 'gracePeriodEndsAt'>): boolean {
    if (!user.gracePeriodEndsAt) return false;
    return new Date(user.gracePeriodEndsAt) > new Date();
  }

  /** True if a tier qualifies the user as a flock leader. */
  static isFlockLeaderTier(tier: string | null | undefined): boolean {
    return !!tier && FLOCK_LEADER_TIERS.includes(tier);
  }

  // ============================================
  // Anti-abuse block — content creation during grace
  // ============================================

  /**
   * Throws LimitReachedError (402) if the user is currently in grace.
   * Call this at the top of every create handler: prayer, pray-on-it,
   * AI generation, flock prayer publish, playlist creation.
   *
   * Reads the user from DB to avoid stale auth-credentials drift.
   */
  static async assertCanCreateContent(userId: string): Promise<void> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT grace_period_ends_at FROM users WHERE id = $1::uuid`,
      [userId]
    );
    if (rows.length === 0) throw new NotFoundError('User');
    const gracePeriodEndsAt = rows[0].grace_period_ends_at;
    if (gracePeriodEndsAt && new Date(gracePeriodEndsAt) > new Date()) {
      throw new LimitReachedError(
        'Your subscription has expired. Resubscribe to create more content.'
      );
    }
  }

  // ============================================
  // State transitions — driven by Apple webhooks
  // ============================================

  /**
   * EXPIRED webhook landed for a flock-leader user → start the 14-day grace.
   * Keeps subscription_tier at its current value so leader can keep managing
   * the flock; only the anti-abuse block prevents new creation.
   */
  static async enterGracePeriod(userId: string, snapshotTier: string): Promise<void> {
    const db = PostgresService.getInstance();
    const endsAt = new Date(Date.now() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    await db.query(
      `UPDATE users
          SET grace_period_ends_at = $1,
              grace_tier_snapshot  = $2,
              updated_at           = NOW()
        WHERE id = $3::uuid`,
      [endsAt, snapshotTier, userId]
    );
    console.log(
      JSON.stringify({
        event: 'grace_period_entered',
        userId,
        snapshotTier,
        endsAt: endsAt.toISOString(),
      })
    );
  }

  /**
   * SUBSCRIBED/DID_RENEW landed for a user in grace → clear grace fields
   * transparently. If their flock was already suspended (grace had expired
   * before resubscribe), the caller should additionally call resumeFlock().
   */
  static async clearGracePeriod(userId: string): Promise<void> {
    const db = PostgresService.getInstance();
    const { rowCount } = await db.query(
      `UPDATE users
          SET grace_period_ends_at = NULL,
              grace_tier_snapshot  = NULL,
              updated_at           = NOW()
        WHERE id = $1::uuid
          AND (grace_period_ends_at IS NOT NULL OR grace_tier_snapshot IS NOT NULL)`,
      [userId]
    );
    if ((rowCount ?? 0) > 0) {
      console.log(JSON.stringify({ event: 'grace_period_cleared', userId }));
    }
  }

  // ============================================
  // Flock suspension / resume
  // ============================================

  /** Suspend the leader's flock. Keeps flock_members rows intact. */
  static async suspendFlock(leaderUserId: string): Promise<{ flockId: string | null }> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `UPDATE flocks
          SET status       = 'suspended',
              suspended_at = NOW(),
              updated_at   = NOW()
        WHERE leader_user_id = $1::uuid
          AND status = 'active'
        RETURNING id`,
      [leaderUserId]
    );
    const flockId = rows[0]?.id ?? null;
    if (flockId) {
      console.log(JSON.stringify({ event: 'flock_suspended', leaderUserId, flockId }));
    }
    return { flockId };
  }

  /** Resume a suspended flock. Returns the flock id if one was resumed. */
  static async resumeFlock(leaderUserId: string): Promise<{ flockId: string | null }> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `UPDATE flocks
          SET status       = 'active',
              suspended_at = NULL,
              updated_at   = NOW()
        WHERE leader_user_id = $1::uuid
          AND status = 'suspended'
        RETURNING id`,
      [leaderUserId]
    );
    const flockId = rows[0]?.id ?? null;
    if (flockId) {
      console.log(JSON.stringify({ event: 'flock_resumed', leaderUserId, flockId }));
    }
    return { flockId };
  }

  // ============================================
  // Cron sub-jobs (called from the Lambda handler's cleanup_deleted_data action)
  // ============================================

  /**
   * Scan for users whose grace period has expired. For each:
   *   - Downgrade subscription_tier → 'free'
   *   - Clear grace_period_ends_at and grace_tier_snapshot
   *   - If the snapshot was a leader tier, suspend their flock and capture
   *     member emails so the caller can notify them
   *
   * Returns enough data for the Lambda handler to send member emails.
   */
  static async expireGracePeriods(): Promise<{
    expiredCount: number;
    flocksSuspended: number;
    expirations: Array<{
      userId: string;
      leaderEmail: string;
      leaderName: string;
      snapshotTier: string;
      flockId: string | null;
      flockName: string | null;
      memberEmails: string[];
    }>;
  }> {
    const db = PostgresService.getInstance();
    const { rows: usersToExpire } = await db.query(
      `SELECT id, email, name, grace_tier_snapshot
         FROM users
        WHERE grace_period_ends_at IS NOT NULL
          AND grace_period_ends_at < NOW()
          AND deleted_at IS NULL`
    );

    const expirations: Array<{
      userId: string;
      leaderEmail: string;
      leaderName: string;
      snapshotTier: string;
      flockId: string | null;
      flockName: string | null;
      memberEmails: string[];
    }> = [];
    let flocksSuspended = 0;

    for (const user of usersToExpire) {
      // Capture flock + member emails BEFORE the suspension transition so the
      // caller can fan out notifications. (Suspension preserves rows; this is
      // for safety against future schema changes.)
      let flockId: string | null = null;
      let flockName: string | null = null;
      let memberEmails: string[] = [];

      if (this.isFlockLeaderTier(user.grace_tier_snapshot)) {
        const { rows: flockRows } = await db.query(
          `SELECT id, name FROM flocks
            WHERE leader_user_id = $1::uuid AND status = 'active'
            LIMIT 1`,
          [user.id]
        );
        if (flockRows[0]) {
          flockId = flockRows[0].id;
          flockName = flockRows[0].name;
          const { rows: memberRows } = await db.query(
            `SELECT u.email
               FROM flock_members fm
               JOIN users u ON u.id = fm.member_user_id
              WHERE fm.flock_id = $1::uuid
                AND u.deleted_at IS NULL`,
            [flockId]
          );
          memberEmails = memberRows.map((r: any) => r.email);
        }
      }

      // Downgrade and clear grace fields atomically
      await db.query(
        `UPDATE users
            SET subscription_tier        = 'free',
                subscription_expires_at  = NULL,
                grace_period_ends_at     = NULL,
                grace_tier_snapshot      = NULL,
                updated_at               = NOW()
          WHERE id = $1::uuid`,
        [user.id]
      );

      // Suspend their flock if they had a leader tier at expiry
      if (flockId) {
        await this.suspendFlock(user.id);
        flocksSuspended += 1;
      }

      expirations.push({
        userId: user.id,
        leaderEmail: user.email,
        leaderName: user.name,
        snapshotTier: user.grace_tier_snapshot,
        flockId,
        flockName,
        memberEmails,
      });

      console.log(
        JSON.stringify({
          event: 'grace_period_expired',
          userId: user.id,
          snapshotTier: user.grace_tier_snapshot,
          flockSuspended: !!flockId,
          memberCount: memberEmails.length,
        })
      );
    }

    return { expiredCount: usersToExpire.length, flocksSuspended, expirations };
  }

  /**
   * Hard-delete flocks that have been suspended for 90+ days.
   * flock_members and flock_prayers cascade via FK constraints.
   * Returns details so the Lambda can email affected members.
   */
  static async cleanupSuspendedFlocks(): Promise<{
    deletedCount: number;
    archived: Array<{
      flockId: string;
      flockName: string;
      leaderUserId: string;
      leaderName: string;
      memberEmails: string[];
    }>;
  }> {
    const db = PostgresService.getInstance();
    const { rows: flocksToDelete } = await db.query(
      `SELECT f.id, f.name, f.leader_user_id, u.name AS leader_name
         FROM flocks f
         JOIN users u ON u.id = f.leader_user_id
        WHERE f.status = 'suspended'
          AND f.suspended_at IS NOT NULL
          AND f.suspended_at < NOW() - INTERVAL '${SHIPWRECK_CLEANUP_DAYS} days'`
    );

    const archived: Array<{
      flockId: string;
      flockName: string;
      leaderUserId: string;
      leaderName: string;
      memberEmails: string[];
    }> = [];

    for (const flock of flocksToDelete) {
      // Capture member emails BEFORE delete cascades
      const { rows: members } = await db.query(
        `SELECT u.email
           FROM flock_members fm
           JOIN users u ON u.id = fm.member_user_id
          WHERE fm.flock_id = $1::uuid
            AND u.deleted_at IS NULL`,
        [flock.id]
      );

      await db.query(`DELETE FROM flocks WHERE id = $1::uuid`, [flock.id]);

      archived.push({
        flockId: flock.id,
        flockName: flock.name,
        leaderUserId: flock.leader_user_id,
        leaderName: flock.leader_name,
        memberEmails: members.map((m: any) => m.email),
      });

      console.log(
        JSON.stringify({
          event: 'flock_archived',
          flockId: flock.id,
          flockName: flock.name,
          leaderUserId: flock.leader_user_id,
          memberCount: members.length,
        })
      );
    }

    return { deletedCount: flocksToDelete.length, archived };
  }
}
