// src/controllers/passwordResetTokenService.ts
import { randomUUID } from 'crypto';
import { PostgresService } from './postgres.service';

export interface PasswordResetTokenData {
  token: string;
  userId: string;
  email: string;
  expiresAt: Date;
  usedAt: Date | null;
}

class PasswordResetTokenService {
  private db = PostgresService.getInstance();

  /**
   * Create a new password reset token for a user
   * Deletes any existing unused tokens for this user
   * Token expires in 1 hour
   */
  async createPasswordResetToken(userId: string, email: string): Promise<string> {
    // Delete any existing unused tokens for this user
    await this.db.query(
      `DELETE FROM password_reset_tokens 
       WHERE user_id = $1 AND used_at IS NULL`,
      [userId]
    );

    const token = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await this.db.query(
      `INSERT INTO password_reset_tokens (token, user_id, email, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [token, userId, email, expiresAt]
    );

    return token;
  }

  /**
   * Validate a password reset token
   * Returns token data if valid, null if invalid/expired/used
   */
  async validateToken(token: string): Promise<PasswordResetTokenData | null> {
    const { rows } = await this.db.query(
      `SELECT token, user_id, email, expires_at, used_at
       FROM password_reset_tokens
       WHERE token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return null;
    }

    const tokenData = rows[0];

    // Check if token has been used
    if (tokenData.used_at) {
      return null;
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return null;
    }

    return {
      token: tokenData.token,
      userId: tokenData.user_id,
      email: tokenData.email,
      expiresAt: new Date(tokenData.expires_at),
      usedAt: tokenData.used_at,
    };
  }

  /**
   * Mark a token as used
   */
  async markTokenAsUsed(token: string): Promise<void> {
    await this.db.query(
      `UPDATE password_reset_tokens
       SET used_at = NOW()
       WHERE token = $1`,
      [token]
    );
  }

  /**
   * Check if user has an active (unused, non-expired) reset token
   */
  async hasActiveToken(userId: string): Promise<boolean> {
    const { rows } = await this.db.query(
      `SELECT COUNT(*) as count
       FROM password_reset_tokens
       WHERE user_id = $1 
         AND used_at IS NULL 
         AND expires_at > NOW()`,
      [userId]
    );

    return parseInt(rows[0].count) > 0;
  }

  /**
   * Clean up expired tokens (optional maintenance task)
   */
  async cleanupExpiredTokens(): Promise<number> {
    const { rowCount } = await this.db.query(
      `DELETE FROM password_reset_tokens
       WHERE expires_at < NOW() AND used_at IS NULL`
    );

    return rowCount || 0;
  }
}

export const passwordResetTokenService = new PasswordResetTokenService();