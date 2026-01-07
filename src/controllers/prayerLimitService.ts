// src/controllers/prayerLimitService.ts
import { PostgresService } from './postgres.service';

export interface SubscriptionInfo {
  tier: 'free' | 'pro' | 'prayer_warrior' | 'lifetime';
  expiresAt: Date | null;
  isActive: boolean;
  prayerCount: number;
  prayerLimit: number | null; // null = unlimited
  canCreatePrayer: boolean;
  remainingPrayers: number | null; // null = unlimited
}

export class PrayerLimitService {
  private static readonly TIER_LIMITS = {
    free: 5,
    pro: 20,
    prayer_warrior: 100,
    lifetime: null, // unlimited
  } as const;

  /**
   * Get the prayer limit for a given tier
   */
  private static getTierLimit(tier: string): number | null {
    const limit = this.TIER_LIMITS[tier as keyof typeof this.TIER_LIMITS];
    
    if (limit === undefined) {
      console.warn(`⚠️ Unknown subscription tier: "${tier}" - defaulting to free tier limit`);
      return this.TIER_LIMITS.free;
    }
    
    return limit;
  }

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
    
    console.log(`📊 [PrayerLimitService] User ${userId}`);
    console.log(`   Tier from DB: "${subscription_tier}" (type: ${typeof subscription_tier})`);
    console.log(`   Expires at: ${subscription_expires_at}`);

    // Count user's active (non-deleted) prayers
    const { rows: prayerRows } = await db.query(
      `SELECT COUNT(*) as count 
       FROM prayers 
       WHERE user_id = $1::uuid`,
      [userId]
    );

    const prayerCount = parseInt(prayerRows[0].count);

    // Determine if subscription is active
    let isActive = true;
    let effectiveTier = subscription_tier;

    // Check if Pro subscription has expired
    if (subscription_tier === 'pro' && subscription_expires_at) {
      isActive = new Date(subscription_expires_at) > new Date();
      if (!isActive) {
        // Expired Pro reverts to free tier limits
        effectiveTier = 'free';
      }
    }

    // Get limit for effective tier
    const prayerLimit = this.getTierLimit(effectiveTier);
    
    console.log(`   Effective tier: "${effectiveTier}"`);
    console.log(`   Prayer count: ${prayerCount}`);
    console.log(`   Prayer limit: ${prayerLimit === null ? 'unlimited' : prayerLimit}`);
    
    // Calculate if user can create more prayers
    const canCreatePrayer = prayerLimit === null || prayerCount < prayerLimit;
    const remainingPrayers = prayerLimit === null 
      ? null 
      : Math.max(0, prayerLimit - prayerCount);

    console.log(`   Can create: ${canCreatePrayer}`);
    console.log(`   Remaining: ${remainingPrayers === null ? 'unlimited' : remainingPrayers}`);

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
      } else if (info.tier === 'free') {
        throw new Error(
          `Free tier is limited to ${this.TIER_LIMITS.free} prayers. You currently have ${info.prayerCount}. Upgrade to Pro for ${this.TIER_LIMITS.pro} prayers!`
        );
      } else if (info.tier === 'pro') {
        throw new Error(
          `Pro tier is limited to ${this.TIER_LIMITS.pro} prayers. You currently have ${info.prayerCount}. Upgrade to Prayer Warrior for ${this.TIER_LIMITS.prayer_warrior} prayers!`
        );
      } else if (info.tier === 'prayer_warrior') {
        throw new Error(
          `Prayer Warrior tier is limited to ${this.TIER_LIMITS.prayer_warrior} prayers. You currently have ${info.prayerCount}. Upgrade to Lifetime for unlimited prayers!`
        );
      } else {
        throw new Error(
          `Prayer limit reached. You currently have ${info.prayerCount} prayers.`
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
       WHERE user_id = $1::uuid`,
      [userId]
    );

    return parseInt(rows[0].count);
  }
}