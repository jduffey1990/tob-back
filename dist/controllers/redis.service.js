"use strict";
// src/controllers/redis.service.ts
// Hybrid Redis service: ioredis for local dev, Upstash HTTP SDK for production
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redisService = void 0;
const redis_1 = require("@upstash/redis");
const ioredis_1 = __importDefault(require("ioredis"));
class RedisService {
    /**
     * Initialize Redis client (called automatically on first use)
     */
    static init() {
        if (this.initialized)
            return;
        this.isProduction = process.env.NODE_ENV === 'production';
        if (this.isProduction) {
            // PRODUCTION: Use Upstash HTTP SDK (Lambda-optimized)
            this.client = this.initUpstashRedis();
            console.log('🌐 Using Upstash HTTP SDK for production');
        }
        else {
            // DEVELOPMENT: Use ioredis for local Docker
            this.client = this.initIORedis();
            console.log('🐳 Using ioredis for local development');
        }
        this.initialized = true;
    }
    static initUpstashRedis() {
        const url = process.env.REDIS_URL;
        const token = process.env.REDIS_TOKEN;
        if (!url || !token) {
            throw new Error('REDIS_URL and REDIS_TOKEN are required in production');
        }
        console.log('🔧 Initializing Upstash Redis...');
        console.log(`   URL: ${url}`);
        console.log(`   Token: ${token.substring(0, 10)}...`);
        return new redis_1.Redis({
            url,
            token,
        });
    }
    static initIORedis() {
        const host = process.env.REDIS_HOST || 'redis';
        const port = parseInt(process.env.REDIS_PORT || '6379');
        const password = process.env.REDIS_PASSWORD || undefined;
        console.log('🔧 Initializing local Redis (ioredis)...');
        console.log(`   Host: ${host}`);
        console.log(`   Port: ${port}`);
        console.log(`   Password: ${password ? '***' : 'none'}`);
        const client = new ioredis_1.default({
            host,
            port,
            password: password || undefined,
            db: process.env.NODE_ENV === 'production' ? 0 : 1,
            retryStrategy: (times) => {
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
    static getInstance() {
        if (!this.initialized) {
            this.init();
        }
        return this.client;
    }
    /**
     * Close Redis connection (for graceful shutdown)
     */
    static disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                return;
            if (!this.isProduction && this.client instanceof ioredis_1.default) {
                yield this.client.quit();
                console.log('✅ Redis disconnected gracefully');
            }
            else {
                console.log('✅ Upstash Redis (no connection to close)');
            }
            this.initialized = false;
        });
    }
    // ==============================================
    // TTS-SPECIFIC HELPER METHODS
    // (Maintains existing API with prayerId AND voiceId)
    // ==============================================
    /**
     * Generate Redis key for TTS build state
     * Format: tts:{prayerId}:{voiceId}
     */
    static getTTSKey(prayerId, voiceId) {
        return `tts:${prayerId}:${voiceId}`;
    }
    /**
     * Check if audio is currently being built
     * Returns true if building, false otherwise
     */
    static isBuilding(prayerId, voiceId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                this.init();
            const key = this.getTTSKey(prayerId, voiceId);
            try {
                const value = yield this.client.get(key);
                return value === 'building';
            }
            catch (error) {
                console.error(`Redis isBuilding error for key "${key}":`, error);
                throw error;
            }
        });
    }
    /**
     * Mark audio as building
     * Sets key with TTL (default 10 minutes)
     * Returns true if lock acquired, false if already building
     */
    static markAsBuilding(prayerId_1, voiceId_1) {
        return __awaiter(this, arguments, void 0, function* (prayerId, voiceId, ttlSeconds = 600) {
            if (!this.initialized)
                this.init();
            const key = this.getTTSKey(prayerId, voiceId);
            try {
                if (this.isProduction) {
                    // Upstash: Use set with NX option
                    const result = yield this.client.set(key, 'building', { ex: ttlSeconds, nx: true });
                    return result === 'OK';
                }
                else {
                    // ioredis: SETNX = SET if Not eXists (atomic operation)
                    // Returns 1 if key was set, 0 if key already existed
                    const result = yield this.client.set(key, 'building', 'EX', ttlSeconds, 'NX');
                    return result === 'OK';
                }
            }
            catch (error) {
                console.error(`Redis markAsBuilding error for key "${key}":`, error);
                throw error;
            }
        });
    }
    /**
     * Clear building state (after audio generation completes)
     */
    static clearBuilding(prayerId, voiceId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                this.init();
            const key = this.getTTSKey(prayerId, voiceId);
            try {
                yield this.client.del(key);
            }
            catch (error) {
                console.error(`Redis clearBuilding error for key "${key}":`, error);
                throw error;
            }
        });
    }
    /**
     * Get remaining TTL for a building operation
     * Returns seconds remaining, or -1 if key doesn't exist, -2 if no expiration
     */
    static getBuildingTTL(prayerId, voiceId) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                this.init();
            const key = this.getTTSKey(prayerId, voiceId);
            try {
                return yield this.client.ttl(key);
            }
            catch (error) {
                console.error(`Redis getBuildingTTL error for key "${key}":`, error);
                throw error;
            }
        });
    }
    // ==============================================
    // ADDITIONAL UTILITY METHODS (if needed)
    // ==============================================
    /**
     * Ping Redis to check connection
     */
    static ping() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                this.init();
            try {
                const response = yield this.client.ping();
                return response === 'PONG';
            }
            catch (error) {
                console.error('Redis PING failed:', error);
                return false;
            }
        });
    }
    /**
     * Get all keys matching pattern
     * WARNING: Use carefully in production!
     */
    static keys(pattern) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.initialized)
                this.init();
            try {
                return yield this.client.keys(pattern);
            }
            catch (error) {
                console.error(`Redis KEYS error for pattern "${pattern}":`, error);
                throw error;
            }
        });
    }
}
RedisService.initialized = false;
// Export singleton instance helper for compatibility
exports.redisService = RedisService;
exports.default = RedisService;
