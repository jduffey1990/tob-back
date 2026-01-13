// src/controllers/redis.service.ts
// Hybrid Redis service: ioredis for local dev, Upstash HTTP SDK for production

import { Redis as UpstashRedis } from '@upstash/redis';
import IORedis from 'ioredis';

type RedisClient = IORedis | UpstashRedis;

class RedisService {
  private static client: RedisClient;
  private static isProduction: boolean;
  private static initialized: boolean = false;

  /**
   * Initialize Redis client (called automatically on first use)
   */
  private static init(): void {
    if (this.initialized) return;

    this.isProduction = process.env.NODE_ENV === 'production';

    if (this.isProduction) {
      // PRODUCTION: Use Upstash HTTP SDK (Lambda-optimized)
      this.client = this.initUpstashRedis();
      console.log('🌐 Using Upstash HTTP SDK for production');
    } else {
      // DEVELOPMENT: Use ioredis for local Docker
      this.client = this.initIORedis();
      console.log('🐳 Using ioredis for local development');
    }

    this.initialized = true;
  }

  private static initUpstashRedis(): UpstashRedis {
    const url = process.env.REDIS_URL;
    const token = process.env.REDIS_TOKEN;

    if (!url || !token) {
      throw new Error('REDIS_URL and REDIS_TOKEN are required in production');
    }

    console.log('🔧 Initializing Upstash Redis...');
    console.log(`   URL: ${url}`);
    console.log(`   Token: ${token.substring(0, 10)}...`);

    return new UpstashRedis({
      url,
      token,
    });
  }

  private static initIORedis(): IORedis {
    const host = process.env.REDIS_HOST || 'redis';
    const port = parseInt(process.env.REDIS_PORT || '6379');
    const password = process.env.REDIS_PASSWORD || undefined;

    console.log('🔧 Initializing local Redis (ioredis)...');
    console.log(`   Host: ${host}`);
    console.log(`   Port: ${port}`);
    console.log(`   Password: ${password ? '***' : 'none'}`);

    const client = new IORedis({
      host,
      port,
      password: password || undefined,
      db: process.env.NODE_ENV === 'production' ? 0 : 1,
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        console.log(`⏳ Redis reconnecting in ${delay}ms (attempt ${times})`);
        return delay;
      },
      connectTimeout: 10000,
      enableOfflineQueue: true,
    });

    // Event handlers for ioredis
    client.on('connect', () => {
      console.log('✅ Redis connected');
    });

    client.on('ready', () => {
      console.log('✅ Redis ready to accept commands');
    });

    client.on('error', (err) => {
      console.error('❌ Redis error:', err);
    });

    client.on('close', () => {
      console.log('🔌 Redis connection closed');
    });

    client.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
    });

    return client;
  }

  /**
   * Get Redis client instance
   */
  public static getInstance(): RedisClient {
    if (!this.initialized) {
      this.init();
    }
    return this.client;
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  public static async disconnect(): Promise<void> {
    if (!this.initialized) return;

    if (!this.isProduction && this.client instanceof IORedis) {
      await this.client.quit();
      console.log('✅ Redis disconnected gracefully');
    } else {
      console.log('✅ Upstash Redis (no connection to close)');
    }

    this.initialized = false;
  }

  // ==============================================
  // TTS-SPECIFIC HELPER METHODS
  // (Maintains existing API with prayerId AND voiceId)
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
    if (!this.initialized) this.init();

    const key = this.getTTSKey(prayerId, voiceId);
    
    try {
      const value = await this.client.get(key);
      return value === 'building';
    } catch (error) {
      console.error(`Redis isBuilding error for key "${key}":`, error);
      throw error;
    }
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
    if (!this.initialized) this.init();

    const key = this.getTTSKey(prayerId, voiceId);

    try {
      if (this.isProduction) {
        // Upstash: Use set with NX option
        const result = await (this.client as UpstashRedis).set(
          key,
          'building',
          { ex: ttlSeconds, nx: true }
        );
        return result === 'OK';
      } else {
        // ioredis: SETNX = SET if Not eXists (atomic operation)
        // Returns 1 if key was set, 0 if key already existed
        const result = await (this.client as IORedis).set(
          key,
          'building',
          'EX',
          ttlSeconds,
          'NX'
        );
        return result === 'OK';
      }
    } catch (error) {
      console.error(`Redis markAsBuilding error for key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Clear building state (after audio generation completes)
   */
  public static async clearBuilding(prayerId: string, voiceId: string): Promise<void> {
    if (!this.initialized) this.init();

    const key = this.getTTSKey(prayerId, voiceId);

    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`Redis clearBuilding error for key "${key}":`, error);
      throw error;
    }
  }

  /**
   * Get remaining TTL for a building operation
   * Returns seconds remaining, or -1 if key doesn't exist, -2 if no expiration
   */
  public static async getBuildingTTL(prayerId: string, voiceId: string): Promise<number> {
    if (!this.initialized) this.init();

    const key = this.getTTSKey(prayerId, voiceId);

    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`Redis getBuildingTTL error for key "${key}":`, error);
      throw error;
    }
  }

  // ==============================================
  // ADDITIONAL UTILITY METHODS (if needed)
  // ==============================================

  /**
   * Ping Redis to check connection
   */
  public static async ping(): Promise<boolean> {
    if (!this.initialized) this.init();

    try {
      const response = await this.client.ping();
      return response === 'PONG';
    } catch (error) {
      console.error('Redis PING failed:', error);
      return false;
    }
  }

  /**
   * Get all keys matching pattern
   * WARNING: Use carefully in production!
   */
  public static async keys(pattern: string): Promise<string[]> {
    if (!this.initialized) this.init();

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error(`Redis KEYS error for pattern "${pattern}":`, error);
      throw error;
    }
  }
}

// Export singleton instance helper for compatibility
export const redisService = RedisService;
export default RedisService;