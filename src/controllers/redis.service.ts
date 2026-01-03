// src/controllers/redis.service.ts
// Redis service for TTS audio build state tracking

import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

export class RedisService {
  private static instance: Redis;

  /**
   * Get singleton Redis instance
   * Automatically connects on first call
   */
  public static getInstance(): Redis {
    if (!RedisService.instance) {
      const config = {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
        // Use different DB for dev vs prod
        db: process.env.NODE_ENV === 'production' ? 0 : 1,
        // Retry strategy
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          console.log(`⏳ Redis reconnecting in ${delay}ms (attempt ${times})`);
          return delay;
        },
        // Connection timeout
        connectTimeout: 10000,
        // Enable offline queue (commands queued while disconnected)
        enableOfflineQueue: true,
      };

      RedisService.instance = new Redis(config);

      RedisService.instance.on('error', (err) => {
        console.error('❌ Redis error:', err);
      });

      RedisService.instance.on('connect', () => {
        console.log('✅ Redis connected');
      });

      RedisService.instance.on('ready', () => {
        console.log('✅ Redis ready to accept commands');
      });

      RedisService.instance.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
      });

      RedisService.instance.on('close', () => {
        console.log('🔌 Redis connection closed');
      });
    }
    
    return RedisService.instance;
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  public static async disconnect(): Promise<void> {
    if (RedisService.instance) {
      await RedisService.instance.quit();
      console.log('✅ Redis disconnected gracefully');
    }
  }

  // ==============================================
  // TTS-SPECIFIC HELPER METHODS
  // ==============================================

  /**
   * Generate Redis key for TTS build state
   * Format: tts:{prayerId}:{voiceId}
   */
  public static getTTSKey(prayerId: string, voiceId: string): string {
    return `tts:${prayerId}:${voiceId}`;
  }

  /**
   * Check if audio is currently being built
   * Returns true if building, false otherwise
   */
  public static async isBuilding(prayerId: string, voiceId: string): Promise<boolean> {
    const redis = RedisService.getInstance();
    const key = RedisService.getTTSKey(prayerId, voiceId);
    const value = await redis.get(key);
    return value === 'building';
  }

  /**
   * Mark audio as building
   * Sets key with TTL (default 10 minutes)
   * Returns true if lock acquired, false if already building
   */
  public static async markAsBuilding(
    prayerId: string, 
    voiceId: string,
    ttlSeconds: number = 600
  ): Promise<boolean> {
    const redis = RedisService.getInstance();
    const key = RedisService.getTTSKey(prayerId, voiceId);
    
    // SETNX = SET if Not eXists (atomic operation)
    // Returns 1 if key was set, 0 if key already existed
    const result = await redis.set(key, 'building', 'EX', ttlSeconds, 'NX');
    
    return result === 'OK';
  }

  /**
   * Clear building state (after audio generation completes)
   */
  public static async clearBuilding(prayerId: string, voiceId: string): Promise<void> {
    const redis = RedisService.getInstance();
    const key = RedisService.getTTSKey(prayerId, voiceId);
    await redis.del(key);
  }

  /**
   * Get remaining TTL for a building operation
   * Returns seconds remaining, or -1 if key doesn't exist, -2 if no expiration
   */
  public static async getBuildingTTL(prayerId: string, voiceId: string): Promise<number> {
    const redis = RedisService.getInstance();
    const key = RedisService.getTTSKey(prayerId, voiceId);
    return await redis.ttl(key);
  }
}