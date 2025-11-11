"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
//src/controllers/redis.service.ts
//TODO: create server side redis storage to optimize application 
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class RedisService {
    static getInstance() {
        if (!RedisService.instance) {
            RedisService.instance = new ioredis_1.default({
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379'),
                password: process.env.REDIS_PASSWORD,
                // Optional: use different DB for development
                db: process.env.NODE_ENV === 'production' ? 0 : 1,
            });
            RedisService.instance.on('error', (err) => {
                console.error('Redis error:', err);
            });
            RedisService.instance.on('connect', () => {
                console.log('✅ Redis connected');
            });
        }
        return RedisService.instance;
    }
}
exports.RedisService = RedisService;
