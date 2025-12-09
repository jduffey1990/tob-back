// src/controllers/prayerLimitService.ts
import { PostgresService } from './postgres.service';

export interface SubscriptionInfo {
  tier: 'free' | 'pro' | 'lifetime';
  expiresAt: Date | null;
  isActive: boolean;
  prayerCount: number;
  prayerLimit: number | null; // null = unlimited
  canCreatePrayer: boolean;
  remainingPrayers: number | null; // null = unlimited
}

export class PrayerLimitService {
  private static readonly FREE_TIER_LIMIT = 5;

  /**
   * Get comprehensive subscription and prayer limit info for a user
   */
  static async getSubscriptionInfo(userId: string): Promise<SubscriptionInfo> {
    const db = PostgresService.getInstance();

    // Get user's subscription info
    const { rows: userRows } = await db.query(
      `SELECT subscription_tier, subscription_expires_at 
       FROM users 
       WHERE id = $1::uuid`,
      [userId]
    );

    if (userRows.length === 0) {
      throw new Error('User not found');
    }

    const { subscription_tier, subscription_expires_at } = userRows[0];

    // Count user's active (non-deleted) prayers
    const { rows: prayerRows } = await db.query(
      `SELECT COUNT(*) as count 
       FROM prayers 
       WHERE user_id = $1::uuid 
         AND deleted_at IS NULL`,
      [userId]
    );

    const prayerCount = parseInt(prayerRows[0].count);

    // Determine if subscription is active
    let isActive = true;
    if (subscription_tier === 'pro' && subscription_expires_at) {
      isActive = new Date(subscription_expires_at) > new Date();
    }

    // Calculate limits based on tier and active status
    let prayerLimit: number | null;
    let canCreatePrayer: boolean;
    let remainingPrayers: number | null;

    if (subscription_tier === 'free' || (subscription_tier === 'pro' && !isActive)) {
      // Free tier or expired Pro (reverts to free)
      prayerLimit = this.FREE_TIER_LIMIT;
      canCreatePrayer = prayerCount < prayerLimit;
      remainingPrayers = Math.max(0, prayerLimit - prayerCount);
    } else {
      // Active Pro or Lifetime = unlimited
      prayerLimit = null;
      canCreatePrayer = true;
      remainingPrayers = null;
    }

    return {
      tier: subscription_tier,
      expiresAt: subscription_expires_at,
      isActive,
      prayerCount,
      prayerLimit,
      canCreatePrayer,
      remainingPrayers
    };
  }

  /**
   * Check if a user can create a new prayer
   * Throws error with helpful message if they can't
   */
  static async checkCanCreatePrayer(userId: string): Promise<void> {
    const info = await this.getSubscriptionInfo(userId);

    if (!info.canCreatePrayer) {
      if (info.tier === 'pro' && !info.isActive) {
        throw new Error(
          'Your Pro subscription has expired. Please renew to continue creating prayers, or delete existing prayers to stay within the free tier limit.'
        );
      } else {
        throw new Error(
          `Free tier is limited to ${this.FREE_TIER_LIMIT} prayers. You currently have ${info.prayerCount}. Upgrade to Pro for unlimited prayers!`
        );
      }
    }
  }

  /**
   * Simple check: can this user create more prayers?
   */
  static async canCreatePrayer(userId: string): Promise<boolean> {
    const info = await this.getSubscriptionInfo(userId);
    return info.canCreatePrayer;
  }

  /**
   * Get just the prayer count for a user
   */
  static async getPrayerCount(userId: string): Promise<number> {
    const db = PostgresService.getInstance();
    
    const { rows } = await db.query(
      `SELECT COUNT(*) as count 
       FROM prayers 
       WHERE user_id = $1::uuid 
         AND deleted_at IS NULL`,
      [userId]
    );

    return parseInt(rows[0].count);
  }
}