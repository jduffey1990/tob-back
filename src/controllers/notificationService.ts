// src/controllers/notificationService.ts
// APNs push fan-out for flock prayer notifications.
//
// Uses Node's built-in http2 + crypto — no external library, keeps the Lambda
// bundle small. The ES256 JWT is signed per-process and reused up to ~50min
// (Apple allows 60min).
//
// Required env:
//   APNS_AUTH_KEY     PEM contents of the .p8 key
//   APNS_KEY_ID       10-char key id from Apple Developer portal
//   APNS_TEAM_ID      10-char team id
//   APNS_BUNDLE_ID    e.g. com.foxdog.TowerOfBabble
//   APNS_ENVIRONMENT  'sandbox' | 'production'

import * as http2 from 'http2';
import * as crypto from 'crypto';
import { PostgresService } from './postgres.service';

// ============================================
// Config
// ============================================
const APNS_HOSTS = {
  sandbox: 'https://api.sandbox.push.apple.com',
  production: 'https://api.push.apple.com',
} as const;

type ApnsEnvironment = keyof typeof APNS_HOSTS;

// JWT must be rotated at least every hour; refresh every 50min to be safe.
const JWT_TTL_MS = 50 * 60 * 1000;

// Concurrency ceiling for per-flock fan-out. Flocks are small today; this just
// guards against a future 500-member flock saturating the Lambda's sockets.
const FANOUT_CONCURRENCY = 10;

// Cap on how long we'll wait for a single APNs response before giving up and
// counting the send as failed. Apple is usually <200ms; 5s is generous.
// Without this, a hung Apple connection would block the whole fan-out until
// Lambda's 30s timeout kills the invocation.
const APNS_REQUEST_TIMEOUT_MS = 5000;

// ============================================
// Types
// ============================================
interface DeliveryTarget {
  tokenId: string;
  apnsToken: string;
  environment: ApnsEnvironment;
  userId: string;
}

interface PrayerPayload {
  id: string;
  title: string;
  flockId?: string | null;
}

interface DeliveryResult {
  success: number;
  failed: number;
  revoked: number;
  skipped: number;
}

// ============================================
// JWT cache (per process)
// ============================================
let cachedJwt: { token: string; expiresAt: number } | null = null;

function signApnsJwt(): string {
  const now = Date.now();
  if (cachedJwt && cachedJwt.expiresAt > now + 60_000) {
    return cachedJwt.token;
  }

  const keyId = required('APNS_KEY_ID');
  const teamId = required('APNS_TEAM_ID');
  const keyPem = required('APNS_AUTH_KEY');

  const header = { alg: 'ES256', kid: keyId, typ: 'JWT' };
  const payload = { iss: teamId, iat: Math.floor(now / 1000) };

  const encode = (obj: object) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');

  const signingInput = `${encode(header)}.${encode(payload)}`;

  // ES256 = ECDSA P-256 + SHA-256. dsaEncoding: 'ieee-p1363' is critical —
  // without it Node returns DER-encoded (variable-length) which Apple rejects.
  const privateKey = crypto.createPrivateKey(keyPem);
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });

  const token = `${signingInput}.${signature.toString('base64url')}`;
  cachedJwt = { token, expiresAt: now + JWT_TTL_MS };
  return token;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name}`);
  return v;
}

// ============================================
// Fan-out query
// ============================================
async function getDeliveryTargets(flockId: string): Promise<DeliveryTarget[]> {
  const db = PostgresService.getInstance();
  const { rows } = await db.query(
    `SELECT dt.id AS token_id,
            dt.apns_token,
            dt.environment,
            dt.user_id
       FROM flock_members fm
       JOIN users u ON u.id = fm.member_user_id
                    AND u.deleted_at IS NULL
                    AND u.flock_notifications_enabled = TRUE
       JOIN device_tokens dt ON dt.user_id = fm.member_user_id
                             AND dt.revoked_at IS NULL
      WHERE fm.flock_id = $1::uuid`,
    [flockId]
  );

  return rows.map((r: any) => ({
    tokenId: r.token_id,
    apnsToken: r.apns_token,
    environment: r.environment,
    userId: r.user_id,
  }));
}

async function revokeToken(tokenId: string, reason: string): Promise<void> {
  const db = PostgresService.getInstance();
  await db.query(
    `UPDATE device_tokens
        SET revoked_at = NOW()
      WHERE id = $1::uuid
        AND revoked_at IS NULL`,
    [tokenId]
  );
  logJson('info', 'apns_token_revoked', { tokenId, reason });
}

// ============================================
// HTTP/2 delivery
// ============================================
interface ApnsPayload {
  aps: {
    alert: { title: string; body: string };
    sound: string;
  };
  prayerId: string;
  flockId: string;
}

async function sendOne(
  session: http2.ClientHttp2Session,
  target: DeliveryTarget,
  bundleId: string,
  jwt: string,
  payload: ApnsPayload
): Promise<'ok' | 'revoke' | 'retry'> {
  return new Promise((resolve) => {
    const body = Buffer.from(JSON.stringify(payload));
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${target.apnsToken}`,
      'authorization': `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
      'content-length': body.length,
    });

    // Guard against double-resolution when the timeout races the response.
    let settled = false;
    const finish = (outcome: 'ok' | 'revoke' | 'retry') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      logJson('warn', 'apns_request_timeout', {
        tokenId: target.tokenId,
        timeoutMs: APNS_REQUEST_TIMEOUT_MS,
      });
      try { req.close(); } catch { /* already closed */ }
      finish('retry');
    }, APNS_REQUEST_TIMEOUT_MS);

    let status = 0;
    let responseBody = '';

    req.on('response', (headers) => {
      status = Number(headers[':status']) || 0;
    });
    req.on('data', (chunk) => { responseBody += chunk.toString(); });
    req.on('end', () => {
      if (status === 200) {
        finish('ok');
        return;
      }
      if (status === 410) {
        // Token no longer valid on the device (uninstalled, etc.)
        finish('revoke');
        return;
      }
      if (status === 400) {
        // BadDeviceToken / DeviceTokenNotForTopic etc. — revoke, don't retry.
        let reason = '';
        try { reason = JSON.parse(responseBody || '{}').reason || ''; } catch { /* ignore */ }
        if (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic') {
          finish('revoke');
          return;
        }
        logJson('warn', 'apns_bad_request', { status, reason, tokenId: target.tokenId });
        finish('retry');
        return;
      }
      logJson('warn', 'apns_non_200', { status, tokenId: target.tokenId, body: responseBody.slice(0, 200) });
      finish('retry');
    });
    req.on('error', (err) => {
      logJson('error', 'apns_request_error', { tokenId: target.tokenId, error: err.message });
      finish('retry');
    });

    req.end(body);
  });
}

// SCALING NOTE: the fan-out runs inline inside the flock prayer POST handler
// (see flockRoutes.ts). Roughly budget ~200-300ms per chunk of FANOUT_CONCURRENCY
// targets. For a flock of N members that's ceil(N / FANOUT_CONCURRENCY) chunks.
// With N ≈ 100 we're still comfortably under Lambda's 30s timeout; around
// N ≈ 500 this starts to risk the handler timing out before the fan-out
// finishes and the prayer post returning 500 to the client. If flocks ever
// grow past ~100 members in practice, migrate this to an SQS-backed worker
// Lambda (mirror the TTS worker pattern) so the prayer post can return
// immediately and delivery happens in a separate invocation that isn't
// constrained by the API Gateway timeout.
async function deliverAll(
  targets: DeliveryTarget[],
  payload: ApnsPayload
): Promise<DeliveryResult> {
  const bundleId = required('APNS_BUNDLE_ID');
  const jwt = signApnsJwt();

  // Group by environment — never mix sandbox/prod on one session.
  const byEnv = new Map<ApnsEnvironment, DeliveryTarget[]>();
  for (const t of targets) {
    const env: ApnsEnvironment = t.environment === 'production' ? 'production' : 'sandbox';
    if (!byEnv.has(env)) byEnv.set(env, []);
    byEnv.get(env)!.push(t);
  }

  const result: DeliveryResult = { success: 0, failed: 0, revoked: 0, skipped: 0 };

  for (const [env, envTargets] of byEnv) {
    const session = http2.connect(APNS_HOSTS[env]);
    session.on('error', (err) => {
      logJson('error', 'apns_session_error', { env, error: err.message });
    });

    try {
      // Bounded concurrency: process in chunks of FANOUT_CONCURRENCY.
      for (let i = 0; i < envTargets.length; i += FANOUT_CONCURRENCY) {
        const chunk = envTargets.slice(i, i + FANOUT_CONCURRENCY);
        const outcomes = await Promise.all(
          chunk.map((t) => sendOne(session, t, bundleId, jwt, payload))
        );
        for (let j = 0; j < outcomes.length; j++) {
          const outcome = outcomes[j];
          const t = chunk[j];
          if (outcome === 'ok') result.success++;
          else if (outcome === 'revoke') {
            await revokeToken(t.tokenId, 'apns_rejected');
            result.revoked++;
          } else {
            result.failed++;
          }
        }
      }
    } finally {
      session.close();
    }
  }

  return result;
}

// ============================================
// Structured logging (matches requestLogger shape)
// ============================================
function logJson(level: 'info' | 'warn' | 'error', type: string, data: Record<string, unknown>) {
  console.log(JSON.stringify({
    level,
    type,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

// ============================================
// Public API
// ============================================
export class NotificationService {
  /**
   * Fan-out APNs notifications to every opted-in flock member with an active
   * device token. Fire-and-forget from the caller's perspective — any error
   * here must NOT break prayer creation.
   */
  public static async notifyFlockOfNewPrayer(
    flockId: string,
    prayer: PrayerPayload,
    leaderName: string
  ): Promise<DeliveryResult> {
    // Allow the whole feature to be turned off without code changes.
    if (process.env.APNS_ENVIRONMENT === 'disabled') {
      return { success: 0, failed: 0, revoked: 0, skipped: 0 };
    }

    const targets = await getDeliveryTargets(flockId);
    if (targets.length === 0) {
      logJson('info', 'flock_push_noop', { flockId, prayerId: prayer.id, reason: 'no_targets' });
      return { success: 0, failed: 0, revoked: 0, skipped: 0 };
    }

    const payload: ApnsPayload = {
      aps: {
        alert: {
          title: leaderName,
          body: `shared a new prayer: ${prayer.title}`,
        },
        sound: 'default',
      },
      prayerId: prayer.id,
      flockId,
    };

    try {
      const result = await deliverAll(targets, payload);
      logJson('info', 'flock_push_delivered', {
        flockId,
        prayerId: prayer.id,
        targetCount: targets.length,
        ...result,
      });
      return result;
    } catch (err: any) {
      logJson('error', 'flock_push_failed', {
        flockId,
        prayerId: prayer.id,
        error: err.message,
      });
      return { success: 0, failed: targets.length, revoked: 0, skipped: 0 };
    }
  }
}
