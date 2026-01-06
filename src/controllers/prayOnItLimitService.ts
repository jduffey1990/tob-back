// src/controllers/prayOnItLimitService.ts
import { PrayOnItService } from './prayOnItService';
import { UserService } from './userService';

/**
 * Tier limits for Pray On It items
 */
const TIER_LIMITS = {
  free: 5,
  pro: 10,
  prayer_warrior: 25,
  lifetime: 25,
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
    
    // Check if tier exists
    if (limit === undefined) {
      throw new Error(`Unknown subscription tier: ${tier}`);
    }
    
    // Check current count
    const currentCount = await PrayOnItService.countUserItems(userId);
    
    if (currentCount >= limit) {
      if (tier === 'free') {
        throw new Error(
          `Pray On It item limit reached. Upgrade to Pro for ${TIER_LIMITS.pro} items!`
        );
      } else if (tier === 'pro') {
        throw new Error(
          `Pray On It item limit reached. Upgrade to Prayer Warrior for ${TIER_LIMITS.prayer_warrior} items!`
        );
      } else {
        throw new Error('Pray On It item limit reached.');
      }
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
    const limit = TIER_LIMITS[tier as keyof typeof TIER_LIMITS] ?? 0;
    const currentCount = await PrayOnItService.countUserItems(userId);
    
    return {
      tier,
      currentCount,
      limit,
      remaining: Math.max(0, limit - currentCount),
      canCreate: currentCount < limit,
    };
  }
}