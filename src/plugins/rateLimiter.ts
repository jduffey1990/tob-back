// src/plugins/rateLimiter.ts
// Hapi plugin for rate limiting the unauthenticated surface.
//
// Why this exists: a native iOS client cannot be authenticated, only its user
// can. CORS never applied (it is browser-enforced, and there is no browser),
// and any secret shipped in the binary is extractable. So the routes that run
// before a JWT exists -- login, signup, activation, password reset -- are open
// to anyone with curl. Everything behind `auth: 'jwt'` is already covered by
// per-user tier quotas; this closes the gap in front of them.
//
// Fixed window, not sliding: an attacker can burst 2x the limit across a window
// boundary. That is fine here -- the goal is to bound automated abuse, not to
// meter precisely, and a fixed window costs one Redis round trip instead of a
// sorted-set read/write pair on every request.
//
// Two hooks:
//   onPreAuth     -- runs after the payload is parsed but before authentication
//                    and before Joi validation, so a rejection costs no DB or
//                    SES work.
//   onPreResponse -- settles failure-counting rules once the status is known.

import { Plugin, Request, ResponseObject, ResponseToolkit, Server } from '@hapi/hapi';
import Boom from '@hapi/boom';
import RedisService from '../controllers/redis.service';

/**
 * 'all'      -- every attempt counts. For routes where the request itself is
 *               the cost: sending mail, creating accounts.
 * 'failures' -- only failed attempts count, and a success clears the bucket.
 *               For credential routes, so ten people signing in from one church
 *               wifi do not lock out the eleventh. Brute force is not going to
 *               land inside a handful of tries, so counting only misses loses
 *               nothing.
 */
type CountMode = 'all' | 'failures';

interface Bucket {
  limit: number;
  windowSeconds: number;
}

interface RateLimitRule {
  method: string;
  /**
   * The Hapi route TEMPLATE, matched against request.route.path -- not the
   * concrete URL. `/send-activation/{email}` never equals the request path
   * `/send-activation/a@b.com`, so matching on request.path silently skips
   * every parameterized route, and skipping fails open.
   */
  routePath: string;
  ip: Bucket;
  /**
   * Optional second bucket keyed on the email in the request. Catches one
   * attacker rotating IPs at a single mailbox, which per-IP limiting cannot
   * see. Read from route params first, then the payload.
   */
  email?: Bucket;
  count: CountMode;
}

interface KeyedBucket extends Bucket {
  key: string;
  kind: 'ip' | 'email';
}

declare module '@hapi/hapi' {
  interface RequestApplicationState {
    /** Set by onPreAuth for 'failures' rules; settled by onPreResponse. */
    rateLimitBuckets?: KeyedBucket[];
  }
}

const MINUTE = 60;
const HOUR = 60 * 60;

// Tuned to be invisible to real users, including a group behind one NAT after a
// church service, while still bounding a bot. Raise the signup cap first if
// anyone reports a false positive -- it is the one most likely to catch a crowd.
const RULES: RateLimitRule[] = [
  {
    method: 'post',
    routePath: '/login',
    ip: { limit: 10, windowSeconds: MINUTE },
    count: 'failures',
  },
  {
    method: 'post',
    routePath: '/create-user',
    ip: { limit: 5, windowSeconds: HOUR },
    count: 'all',
  },
  {
    method: 'post',
    routePath: '/request-password-reset',
    ip: { limit: 3, windowSeconds: HOUR },
    email: { limit: 3, windowSeconds: HOUR },
    count: 'all',
  },
  {
    method: 'post',
    routePath: '/send-activation/{email}',
    ip: { limit: 5, windowSeconds: HOUR },
    email: { limit: 3, windowSeconds: HOUR },
    count: 'all',
  },
  {
    // The one route here with no inherent guard: resendActivationToken deletes
    // any existing token and issues a new one, so every call sends mail. The
    // per-email bucket is that guard. Deliberately not an hasActiveToken check
    // like its siblings -- that would block the resend this route exists to do.
    method: 'post',
    routePath: '/resend-activation/{email}',
    ip: { limit: 5, windowSeconds: HOUR },
    email: { limit: 3, windowSeconds: HOUR },
    count: 'all',
  },
];

/**
 * The caller's source IP.
 *
 * Deliberately NOT X-Forwarded-For: API Gateway appends to whatever the client
 * sent, so the head of that list is attacker-controlled and trivially spoofed
 * to get a fresh bucket per request. serverless-express instead sets the socket
 * remoteAddress from requestContext.http.sourceIp -- the real TCP peer as seen
 * by API Gateway -- which surfaces here as request.info.remoteAddress.
 */
function clientIp(request: Request): string {
  return request.info.remoteAddress || 'unknown';
}

/** The email this request is about, from route params or payload. */
function requestEmail(request: Request): string | null {
  const fromParams = request.params?.email;
  const payload = request.payload as { email?: unknown } | null;
  const raw = typeof fromParams === 'string' ? fromParams : payload?.email;

  if (typeof raw !== 'string') return null;

  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 && normalized.length <= 320 ? normalized : null;
}

function findRule(request: Request): RateLimitRule | undefined {
  const method = request.method.toLowerCase();
  const routePath = request.route?.path;

  return RULES.find(
    rule => rule.method.toLowerCase() === method && rule.routePath === routePath
  );
}

function bucketsFor(request: Request, rule: RateLimitRule): KeyedBucket[] {
  const buckets: KeyedBucket[] = [
    { key: `ratelimit:ip:${rule.routePath}:${clientIp(request)}`, kind: 'ip', ...rule.ip },
  ];

  if (rule.email) {
    const email = requestEmail(request);
    if (email) {
      buckets.push({
        key: `ratelimit:email:${rule.routePath}:${email}`,
        kind: 'email',
        ...rule.email,
      });
    }
  }

  return buckets;
}

function statusOf(request: Request): number {
  const response = request.response;
  if (!response) return 0;

  return Boom.isBoom(response)
    ? response.output.statusCode
    : (response as ResponseObject).statusCode;
}

/**
 * Logged once per window per offender -- only on the request that crosses the
 * limit, never on the ones rejected afterwards. Otherwise a sustained attack
 * would have us paying for a CloudWatch line per rejected request, which is the
 * cost amplification this plugin exists to prevent.
 */
function logBreach(request: Request, bucket: KeyedBucket, ip: string): void {
  console.warn(
    JSON.stringify({
      level: 'warn',
      type: 'rate_limit_exceeded',
      path: request.route?.path ?? request.path,
      method: request.method,
      // Which bucket tripped, never its value -- the key holds the address,
      // the log should not.
      bucket: bucket.kind,
      sourceIp: ip,
      limit: bucket.limit,
      windowSeconds: bucket.windowSeconds,
      timestamp: new Date().toISOString(),
    })
  );
}

/**
 * Fail open. Redis being unreachable must not take login and signup down with
 * it -- an unlimited login route is a smaller problem than an app nobody can
 * get into. Scoped to the Redis call alone so a bug in this plugin surfaces as
 * a 500 instead of silently disabling every limit.
 */
async function failOpen<T>(request: Request, fallback: T, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    console.error(
      JSON.stringify({
        level: 'error',
        type: 'rate_limit_unavailable',
        path: request.route?.path ?? request.path,
        method: request.method,
        error: error?.message ?? String(error),
        timestamp: new Date().toISOString(),
      })
    );
    return fallback;
  }
}

/** Seconds until this bucket's window rolls, repairing a lost TTL. */
async function retryAfterFor(bucket: KeyedBucket): Promise<number> {
  const ttl = await RedisService.getRateLimitTTL(bucket.key);
  if (ttl >= 0) return ttl;

  // incrementRateLimit sets the count and the expiry as two commands. A crash
  // between them leaves a key with no TTL, which would pin this caller at their
  // cap forever, so treat a missing TTL as a stale window and re-arm it.
  await RedisService.armRateLimitWindow(bucket.key, bucket.windowSeconds);
  return bucket.windowSeconds;
}

function tooManyRequests(retryAfter: number): Boom.Boom {
  const error = Boom.tooManyRequests('Too many requests. Please try again shortly.');
  error.output.headers['Retry-After'] = String(retryAfter);
  return error;
}

const rateLimiterPlugin: Plugin<{}> = {
  name: 'rateLimiter',
  version: '1.0.0',
  register: async (server: Server) => {
    // ─── onPreAuth: check, and for 'all' rules also charge ───
    server.ext('onPreAuth', async (request: Request, h: ResponseToolkit) => {
      const rule = findRule(request);
      if (!rule) return h.continue;

      const ip = clientIp(request);
      const buckets = bucketsFor(request, rule);

      for (const bucket of buckets) {
        const stored = await failOpen(request, 0, () =>
          rule.count === 'all'
            ? RedisService.incrementRateLimit(bucket.key, bucket.windowSeconds)
            : RedisService.getRateLimitCount(bucket.key)
        );

        // The two modes store different things, so normalise before comparing.
        // 'all' has already counted this request; 'failures' holds only prior
        // failures, and this request is a prospective one. Comparing them the
        // same way lets a 'failures' rule through on limit + 1.
        const effective = rule.count === 'all' ? stored : stored + 1;
        if (effective <= bucket.limit) continue;

        // Only the first rejection in a window logs; later ones are silent. In
        // 'failures' mode the bucket fills in onPreResponse, which logs there.
        if (rule.count === 'all' && stored === bucket.limit + 1) {
          logBreach(request, bucket, ip);
        }

        const retryAfter = await failOpen(request, bucket.windowSeconds, () =>
          retryAfterFor(bucket)
        );
        throw tooManyRequests(retryAfter);
      }

      // Nothing was charged for a 'failures' rule -- settle it once we know
      // whether the attempt actually failed.
      if (rule.count === 'failures') {
        request.app.rateLimitBuckets = buckets;
      }

      return h.continue;
    });

    // ─── onPreResponse: charge failures, forgive successes ───
    server.ext('onPreResponse', async (request: Request, h: ResponseToolkit) => {
      const buckets = request.app.rateLimitBuckets;
      if (!buckets?.length) return h.continue;

      const status = statusOf(request);

      // Our own 429 must not charge the bucket again, or a locked-out caller
      // would extend their own lockout by retrying.
      if (status === 429) return h.continue;

      const failed = status >= 400;
      const ip = clientIp(request);

      for (const bucket of buckets) {
        await failOpen(request, undefined, async () => {
          if (!failed) {
            await RedisService.resetRateLimit(bucket.key);
            return;
          }

          const count = await RedisService.incrementRateLimit(
            bucket.key,
            bucket.windowSeconds
          );
          // Bucket just filled -- the next attempt is the one that gets a 429.
          if (count === bucket.limit) {
            logBreach(request, bucket, ip);
          }
        });
      }

      return h.continue;
    });
  },
};

export default rateLimiterPlugin;
