// src/controllers/authService.ts
import bcrypt from 'bcrypt';
import Jwt from '@hapi/jwt';
import dotenv from 'dotenv';
import { Request, ResponseToolkit } from '@hapi/hapi';
import { PostgresService } from './postgres.service';
import { User, UserSafe } from '../models/user';

dotenv.config();
const jwtSecret = process.env.JWT_SECRET || '';

function rowToUserSafe(row: any): UserSafe {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    email: row.email,
    name: row.name,
    status: row.status,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class AuthService {
  /**
   * Validate user credentials and issue a JWT on success.
   */
  public static async validateUser(
    _request: Request,
    email: string,
    password: string,
    _h: ResponseToolkit
  ): Promise<{ isValid: boolean; credentials?: UserSafe; token?: string }> {
    const db = PostgresService.getInstance();

    // Load the user by email (case-insensitive), include password_hash for verification
    const { rows } = await db.query(
      `SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at, password_hash
         FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`,
      [email]
    );

    const row = rows[0];
    if (!row) return { isValid: false };

    const passwordOk = await bcrypt.compare(password, row.password_hash);
    if (!passwordOk) return { isValid: false };

    // Build a safe user object (exclude password_hash)
    const safe = rowToUserSafe(row);

    // Create JWT (keep payload minimal)
    const token = Jwt.token.generate(
      { id: safe.id, email: safe.email },
      jwtSecret
    );

    return { isValid: true, credentials: safe, token };
  }

  /**
   * Validate a decoded JWT (Hapi @hapi/jwt validate hook).
   * Accepts a few shapes for `decoded` depending on how Hapi passes artifacts.
   */
  public static async validateToken(
    decoded: any,
    _request: Request,
    _h: ResponseToolkit
  ): Promise<{ isValid: boolean; credentials?: UserSafe }> {
    // Handle common shapes: decoded.payload OR decoded.decoded.payload OR decoded
    const payload =
      decoded?.decoded?.payload ??
      decoded?.payload ??
      decoded;

    const userId = payload?.id as string | undefined;
    if (!userId) return { isValid: false };

    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at
         FROM users
        WHERE id = $1::uuid
        LIMIT 1`,
      [userId]
    );

    const row = rows[0];
    if (!row) return { isValid: false };

    return { isValid: true, credentials: rowToUserSafe(row) };
  }
}
