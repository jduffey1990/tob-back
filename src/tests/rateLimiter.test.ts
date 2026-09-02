// Behavioural tests for the rate limiter, against a stubbed Redis.
//
// Worth having because the two count modes store different things -- 'all'
// counts the request in front of you, 'failures' counts only prior misses --
// and comparing them the same way silently lets a failures rule through on
// limit + 1. That is exactly the bug these caught.
import Hapi from '@hapi/hapi';
import rateLimiterPlugin from '../plugins/rateLimiter';
import RedisService from '../controllers/redis.service';

const store = new Map<string, number>();

jest.spyOn(RedisService, 'incrementRateLimit').mockImplementation(async (k: string) => {
  const n = (store.get(k) ?? 0) + 1; store.set(k, n); return n;
});
jest.spyOn(RedisService, 'getRateLimitCount').mockImplementation(async (k: string) => store.get(k) ?? 0);
jest.spyOn(RedisService, 'resetRateLimit').mockImplementation(async (k: string) => { store.delete(k); });
jest.spyOn(RedisService, 'getRateLimitTTL').mockImplementation(async () => 42);
jest.spyOn(RedisService, 'armRateLimitWindow').mockImplementation(async () => {});

let server: Hapi.Server;
let loginSucceeds = false;

beforeAll(async () => {
  server = Hapi.server({ port: 0 });
  await server.register(rateLimiterPlugin);
  server.route([
    { method: 'POST', path: '/login', options: { auth: false },
      handler: (_r, h) => loginSucceeds ? h.response({ ok: true }).code(200)
                                        : h.response({ e: 'bad' }).code(401) },
    { method: 'POST', path: '/resend-activation/{email}', options: { auth: false },
      handler: (_r, h) => h.response({ ok: true }).code(200) },
  ]);
  await server.initialize();
});
afterAll(async () => { await server.stop(); });
beforeEach(() => { store.clear(); loginSucceeds = false; });

const login = () => server.inject({ method: 'POST', url: '/login', payload: { email: 'a@b.com', password: 'x' } });
const resend = (email: string) => server.inject({ method: 'POST', url: `/resend-activation/${email}` });

test('parameterized route is matched via request.route.path', async () => {
  // Distinct mailboxes so the per-ip bucket (5) is what binds, not the
  // per-email bucket (3). Matching on request.path would skip this route
  // entirely and every one of these would return 200.
  for (let i = 0; i < 5; i++) expect((await resend(`u${i}@b.com`)).statusCode).toBe(200);
  const blocked = await resend('u5@b.com');
  expect(blocked.statusCode).toBe(429);
  expect(blocked.headers['retry-after']).toBe('42');
});

test('per-email bucket catches IP rotation at one mailbox', async () => {
  for (let i = 0; i < 3; i++) expect((await resend('t@b.com')).statusCode).toBe(200);
  // 4th trips the email bucket (limit 3) before the ip bucket (limit 5)
  expect((await resend('t@b.com')).statusCode).toBe(429);
  // a different mailbox from the same ip is unaffected until the ip cap
  expect((await resend('other@b.com')).statusCode).toBe(200);
});

test('login counts failures only, and success clears the bucket', async () => {
  for (let i = 0; i < 10; i++) expect((await login()).statusCode).toBe(401);
  expect((await login()).statusCode).toBe(429);

  store.clear();
  loginSucceeds = true;
  for (let i = 0; i < 30; i++) expect((await login()).statusCode).toBe(200);
  expect(store.size).toBe(0);
});

test('a success mid-streak forgives earlier failures', async () => {
  for (let i = 0; i < 9; i++) await login();
  loginSucceeds = true;
  expect((await login()).statusCode).toBe(200);
  loginSucceeds = false;
  for (let i = 0; i < 10; i++) expect((await login()).statusCode).toBe(401);
});

test('a 429 does not extend its own lockout', async () => {
  for (let i = 0; i < 10; i++) await login();
  const key = [...store.keys()][0];
  expect(store.get(key)).toBe(10);
  await login(); await login(); await login();
  expect(store.get(key)).toBe(10);
});

test('redis failure fails open', async () => {
  (RedisService.incrementRateLimit as jest.Mock).mockRejectedValueOnce(new Error('redis down'));
  expect((await resend('x@b.com')).statusCode).toBe(200);
});
