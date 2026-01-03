// src/routes/prayerRoutes.ts
import { ServerRoute } from '@hapi/hapi';
import { RedisService } from '../controllers/redis.service';

export const redisRoutes: ServerRoute[] = [
  // ============================================
  // GET /prayers - List user's prayers
  // ============================================
  {
  method: 'GET',
  path: '/test-redis',
  handler: async (request, h) => {
    const redis = RedisService.getInstance();
    await redis.set('test-key', 'hello-redis');
    const value = await redis.get('test-key');
    return { success: true, value };
  },
  options: { auth: false }
}
];