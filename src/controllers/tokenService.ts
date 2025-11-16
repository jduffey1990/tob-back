// src/services/activationToken.service.ts
import crypto from 'crypto';
import { ActivationToken} from '../models/user';
import { PostgresService } from './postgres.service';

// Token expiry duration: 72 hours (3 days)
const TOKEN_EXPIRY_HOURS = 72;

export class ActivationTokenService {
  /**
   * Generate a new activation token for a user
   */
  async createActivationToken(userId: string, email: string): Promise<string> {
    // Generate cryptographically secure random token
    const token = crypto.randomBytes(32).toString('hex'); // 64 hex characters
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);
    const db = PostgresService.getInstance();

    // Insert into database
    await db.query(
      `INSERT INTO activation_tokens (user_id, email, token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, email, token, expiresAt]
    );

    return token;
  }

  /**
   * Validate and retrieve activation token
   * Returns null if token is invalid, expired, or already used
   */
  async validateToken(token: string): Promise<ActivationToken | null> {
    const db = PostgresService.getInstance();

    
    const result = await db.query(
      `SELECT * FROM activation_tokens
       WHERE token = $1
       AND used_at IS NULL
       AND expires_at > NOW()`,
      [token]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    
    // Map snake_case DB columns to camelCase
    const tokenData: ActivationToken = {
      id: row.id,
      userId: row.user_id,      // ✅ Map snake_case to camelCase
      email: row.email,
      token: row.token,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      usedAt: row.used_at
    };

    return tokenData;
  }

  /**
   * Delete all tokens for a specific user
   * Useful when user requests a new activation email
   */
  async deleteUserTokens(userId: string): Promise<void> {
    const db = PostgresService.getInstance();
    await db.query(
      `DELETE FROM activation_tokens
       WHERE user_id = $1`,
      [userId]
    );
  }

  /**
   * Clean up expired tokens (should be run periodically via cron)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const db = PostgresService.getInstance();
    const result = await db.query(
      `DELETE FROM activation_tokens
       WHERE expires_at < NOW()
       RETURNING id`
    );

    return result.rowCount || 0;
  }

  /**
   * Check if user has an active (unused, non-expired) token
   */
  async hasActiveToken(userId: string): Promise<boolean> {
    const db = PostgresService.getInstance();
    const result = await db.query(
      `SELECT EXISTS(
        SELECT 1 FROM activation_tokens
        WHERE user_id = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      ) as has_token`,
      [userId]
    );

    return result.rows[0].has_token;
  }

  /**
   * Resend activation - delete old tokens and create new one
   */
  async resendActivationToken(userId: string, email: string): Promise<string> {
    // Delete any existing tokens for this user
    await this.deleteUserTokens(userId);
    
    // Create a new token
    return await this.createActivationToken(userId, email);
  }

  async markTokenAsUsed(token: string): Promise<void> {
    const db = PostgresService.getInstance();
    
    await db.query(
      `UPDATE activation_tokens
       SET used_at = NOW()
       WHERE token = $1`,
      [token]
    );
  }
}

// Export singleton instance
export const activationTokenService = new ActivationTokenService();