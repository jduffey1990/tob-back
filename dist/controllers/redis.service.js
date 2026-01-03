"use strict";
// src/controllers/redis.service.ts
// Redis service for TTS audio build state tracking
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
exports.RedisService = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class RedisService {
    /**
     * Get singleton Redis instance
     * Automatically connects on first call
     */
    static getInstance() {
        if (!RedisService.instance) {
            const config = {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD || undefined,
                // Use different DB for dev vs prod
                db: process.env.NODE_ENV === 'production' ? 0 : 1,
                // Retry strategy
                retryStrategy: (times) => {
                    const delay = Math.min(times * 50, 2000);
                    console.log(`⏳ Redis reconnecting in ${delay}ms (attempt ${times})`);
                    return delay;
                },
                // Connection timeout
                connectTimeout: 10000,
                // Enable offline queue (commands queued while disconnected)
                enableOfflineQueue: true,
            };
            RedisService.instance = new ioredis_1.default(config);
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
    static disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (RedisService.instance) {
                yield RedisService.instance.quit();
                console.log('✅ Redis disconnected gracefully');
            }
        });
    }
    // ==============================================
    // TTS-SPECIFIC HELPER METHODS
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
            const redis = RedisService.getInstance();
            const key = RedisService.getTTSKey(prayerId, voiceId);
            const value = yield redis.get(key);
            return value === 'building';
        });
    }
    /**
     * Mark audio as building
     * Sets key with TTL (default 10 minutes)
     * Returns true if lock acquired, false if already building
     */
    static markAsBuilding(prayerId_1, voiceId_1) {
        return __awaiter(this, arguments, void 0, function* (prayerId, voiceId, ttlSeconds = 600) {
            const redis = RedisService.getInstance();
            const key = RedisService.getTTSKey(prayerId, voiceId);
            // SETNX = SET if Not eXists (atomic operation)
            // Returns 1 if key was set, 0 if key already existed
            const result = yield redis.set(key, 'building', 'EX', ttlSeconds, 'NX');
            return result === 'OK';
        });
    }
    /**
     * Clear building state (after audio generation completes)
     */
    static clearBuilding(prayerId, voiceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const redis = RedisService.getInstance();
            const key = RedisService.getTTSKey(prayerId, voiceId);
            yield redis.del(key);
        });
    }
    /**
     * Get remaining TTL for a building operation
     * Returns seconds remaining, or -1 if key doesn't exist, -2 if no expiration
     */
    static getBuildingTTL(prayerId, voiceId) {
        return __awaiter(this, void 0, void 0, function* () {
            const redis = RedisService.getInstance();
            const key = RedisService.getTTSKey(prayerId, voiceId);
            return yield redis.ttl(key);
        });
    }
}
exports.RedisService = RedisService;
