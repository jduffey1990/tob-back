// src/controllers/deviceTokenService.ts
// CRUD for APNs device tokens. The iOS client calls registerToken on sign-in and
// every token refresh. Logout calls revokeToken. The fan-out in NotificationService
// does its own joined lookup; getActiveTokensForUsers is here for any other caller
// that needs a plain token list by user id.

import { PostgresService } from './postgres.service';
import { NotFoundError, ValidationError } from '../errors/AppErrors';

export type ApnsEnvironment = 'sandbox' | 'production';

export interface DeviceToken {
  id: string;
  userId: string;
  apnsToken: string;
  environment: ApnsEnvironment;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

function mapRow(row: any): DeviceToken {
  return {
    id: row.id,
    userId: row.user_id,
    apnsToken: row.apns_token,
    environment: row.environment,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at ?? null,
  };
}

export class DeviceTokenService {
  /**
   * Upsert a device token. If the same (user, token) row exists — whether active
   * or previously revoked — it is refreshed: last_seen_at bumped, revoked_at cleared.
   */
  public static async registerToken(
    userId: string,
    apnsToken: string,
    environment: ApnsEnvironment
  ): Promise<DeviceToken> {
    if (!apnsToken || apnsToken.length < 32) {
      throw new ValidationError('apnsToken is required and must be a valid APNs hex token');
    }
    if (environment !== 'sandbox' && environment !== 'production') {
      throw new ValidationError(`environment must be 'sandbox' or 'production'`);
    }

    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `INSERT INTO device_tokens (user_id, apns_token, environment)
       VALUES ($1::uuid, $2, $3)
       ON CONFLICT (user_id, apns_token)
       DO UPDATE SET last_seen_at = NOW(),
                     revoked_at = NULL,
                     environment = EXCLUDED.environment
       RETURNING id, user_id, apns_token, environment, created_at, last_seen_at, revoked_at`,
      [userId, apnsToken, environment]
    );

    return mapRow(rows[0]);
  }

  /**
   * Soft-revoke — called on logout or when the client can't deliver.
   */
  public static async revokeToken(userId: string, apnsToken: string): Promise<void> {
    const db = PostgresService.getInstance();
    const { rowCount } = await db.query(
      `UPDATE device_tokens
          SET revoked_at = NOW()
        WHERE user_id = $1::uuid
          AND apns_token = $2
          AND revoked_at IS NULL`,
      [userId, apnsToken]
    );

    if (rowCount === 0) {
      // Idempotent — already revoked or never registered. Don't 404 on logout.
      return;
    }
  }

  /**
   * Bulk lookup: all active tokens for the given user ids. Useful for any
   * future non-flock notification path.
   */
  public static async getActiveTokensForUsers(userIds: string[]): Promise<DeviceToken[]> {
    if (userIds.length === 0) return [];

    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, user_id, apns_token, environment, created_at, last_seen_at, revoked_at
         FROM device_tokens
        WHERE user_id = ANY($1::uuid[])
          AND revoked_at IS NULL`,
      [userIds]
    );

    return rows.map(mapRow);
  }

  /**
   * Server-side on/off toggle for flock push. OS-level permission is separate
   * and owned by the device; this just lets a user mute without revoking.
   */
  public static async updateFlockNotificationPreference(
    userId: string,
    enabled: boolean
  ): Promise<{ flockNotificationsEnabled: boolean }> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `UPDATE users
          SET flock_notifications_enabled = $1,
              updated_at = NOW()
        WHERE id = $2::uuid
        RETURNING flock_notifications_enabled`,
      [enabled, userId]
    );

    if (!rows[0]) throw new NotFoundError('User');
    return { flockNotificationsEnabled: rows[0].flock_notifications_enabled };
  }

  public static async getFlockNotificationPreference(
    userId: string
  ): Promise<{ flockNotificationsEnabled: boolean }> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT flock_notifications_enabled FROM users WHERE id = $1::uuid LIMIT 1`,
      [userId]
    );
    if (!rows[0]) throw new NotFoundError('User');
    return { flockNotificationsEnabled: rows[0].flock_notifications_enabled };
  }
}
