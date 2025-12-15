// src/controllers/prayOnItLimitService.ts
import { UserService } from './userService';
import { PrayOnItService } from './prayOnItService';

/**
 * Tier limits for Pray On It items
 */
const TIER_LIMITS = {
  free: 5,
  pro: 50,
  lifetime: null,  // unlimited
  prayer_warrior: null,  // unlimited
} as const;

export class PrayOnItLimitService {
  /**
   * Check if a user can create a new Pray On It item
   * Throws error if limit reached
   */
  public static async checkCanCreateItem(userId: string): Promise<void> {
    const user = await UserService.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const tier = user.subscriptionTier || 'free';
    const limit = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
    
    // Unlimited tiers
    if (limit === null) {
      return;
    }
    
    // Check current count
    const currentCount = await PrayOnItService.countUserItems(userId);
    
    if (currentCount >= limit) {
      throw new Error(
        `Pray On It item limit reached. ${tier === 'free' ? 'Upgrade to Pro for 50 items!' : 'You have reached your limit.'}`
      );
    }
  }
  
  /**
   * Get comprehensive info about user's Pray On It limits
   */
  public static async getItemLimitInfo(userId: string) {
    const user = await UserService.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }
    
    const tier = user.subscriptionTier || 'free';
    const limit = TIER_LIMITS[tier as keyof typeof TIER_LIMITS];
    const currentCount = await PrayOnItService.countUserItems(userId);
    
    return {
      tier,
      currentCount,
      limit,  // null = unlimited
      remaining: limit === null ? null : Math.max(0, limit - currentCount),
      canCreate: limit === null || currentCount < limit,
    };
  }
}