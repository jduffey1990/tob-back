"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserService = void 0;
// src/controllers/userService.ts
const postgres_service_1 = require("./postgres.service");
const user_1 = require("../models/user");
// Map db row -> UserSafe (snake_case -> camelCase)
function mapRowToUserSafe(row) {
    var _a, _b, _c;
    return {
        id: row.id,
        email: row.email,
        name: row.name,
        status: row.status,
        subscriptionTier: row.subscription_tier,
        subscriptionExpiresAt: (_a = row.subscription_expires_at) !== null && _a !== void 0 ? _a : null,
        settings: (_b = row.settings) !== null && _b !== void 0 ? _b : user_1.DEFAULT_USER_SETTINGS, // NEW: Parse settings JSON
        deletedAt: (_c = row.deleted_at) !== null && _c !== void 0 ? _c : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class UserService {
    /**
     * Get all users (safe).
     */
    static findAllUsers() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const { rows } = yield db.query(`SELECT id, email, name, status, subscription_tier, subscription_expires_at,
              settings, deleted_at, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`);
            return rows.map(mapRowToUserSafe);
        });
    }
    /**
     * Get one user by id (safe).
     */
    static findUserById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const { rows } = yield db.query(`SELECT id, email, name, status, subscription_tier, subscription_expires_at,
              settings, deleted_at, created_at, updated_at
         FROM users
        WHERE id = $1::uuid
        LIMIT 1`, [id]);
            return rows[0] ? mapRowToUserSafe(rows[0]) : null;
        });
    }
    /**
     * Get one user by email (safe).
     */
    static findUserByEmail(email) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const { rows } = yield db.query(`SELECT id, email, name, status, subscription_tier, subscription_expires_at,
              settings, deleted_at, created_at, updated_at
         FROM users
        WHERE email = $1
        LIMIT 1`, [email]);
            return rows[0] ? mapRowToUserSafe(rows[0]) : null;
        });
    }
    /**
     * Create a user. Accept a passwordHash (already hashed with bcrypt/argon2).
     * UNIQUE(email) enforced in DB; we convert 23505 to your legacy duplicate message.
     */
    static createUser(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            const db = postgres_service_1.PostgresService.getInstance();
            const status = (_a = input.status) !== null && _a !== void 0 ? _a : 'active';
            try {
                const { rows } = yield db.query(`INSERT INTO users (email, password_hash, name, status)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                   settings, deleted_at, created_at, updated_at`, [input.email, input.passwordHash, input.name, status]);
                return mapRowToUserSafe(rows[0]);
            }
            catch (err) {
                if ((err === null || err === void 0 ? void 0 : err.code) === '23505') {
                    // Keeps your frontend logic unchanged
                    throw new Error('duplicate key value violates unique constraint');
                }
                throw err;
            }
        });
    }
    /**
     * Update user fields dynamically - only updates fields that are provided
     */
    static updateUser(userId, updates) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            // Filter out undefined values (but keep null for subscriptionExpiresAt)
            const fields = Object.entries(updates).filter(([_, value]) => value !== undefined);
            if (fields.length === 0) {
                throw new Error('No fields to update');
            }
            // Build dynamic SET clause
            const setClauses = fields.map(([key, _], index) => {
                // Convert camelCase to snake_case for DB columns
                const dbColumn = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
                return `${dbColumn} = $${index + 1}`;
            });
            const values = fields.map(([_, value]) => value);
            values.push(userId); // Add userId as last parameter
            const query = `
      UPDATE users
      SET ${setClauses.join(', ')},
          updated_at = NOW()
      WHERE id = $${values.length}::uuid
      RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                settings, deleted_at, created_at, updated_at
    `;
            const { rows } = yield db.query(query, values);
            if (!rows[0])
                throw new Error('User not found');
            return mapRowToUserSafe(rows[0]);
        });
    }
    /**
     * NEW: Update user settings (voiceIndex, playbackRate)
     * Uses JSONB merge operator (||) to update only provided fields
     */
    static updateSettings(userId, settingsUpdate) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            // Validate voiceIndex if provided
            if (settingsUpdate.voiceIndex !== undefined) {
                if (settingsUpdate.voiceIndex < 0 || settingsUpdate.voiceIndex > 8) {
                    throw new Error('voiceIndex must be between 0 and 8');
                }
            }
            // Validate playbackRate if provided
            if (settingsUpdate.playbackRate !== undefined) {
                if (settingsUpdate.playbackRate < 0.0 || settingsUpdate.playbackRate > 1.0) {
                    throw new Error('playbackRate must be between 0.0 and 1.0');
                }
            }
            const query = `
      UPDATE users
      SET settings = settings || $1::jsonb,
          updated_at = NOW()
      WHERE id = $2::uuid AND deleted_at IS NULL
      RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                settings, deleted_at, created_at, updated_at
    `;
            const { rows } = yield db.query(query, [
                JSON.stringify(settingsUpdate),
                userId
            ]);
            if (!rows[0])
                throw new Error('User not found');
            return mapRowToUserSafe(rows[0]);
        });
    }
    /** Flip user status to 'active' (only from 'inactive') and return the safe user. */
    static activateUser(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const { rows } = yield db.query(`UPDATE users
          SET status = 'active'
        WHERE id = $1::uuid
          AND status = 'inactive'
        RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                  settings, deleted_at, created_at, updated_at`, [userId]);
            if (!rows[0]) {
                // Not found OR already active/disabled
                throw new Error('Activation failed: user not found or already active');
            }
            return mapRowToUserSafe(rows[0]);
        });
    }
    /**
     * Soft delete (optional): set deleted_at; keep row for audit.
     */
    static softDelete(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const { rows } = yield db.query(`UPDATE users
          SET deleted_at = NOW()
        WHERE id = $1::uuid
        RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                  settings, deleted_at, created_at, updated_at`, [userId]);
            if (!rows[0])
                throw new Error('User not found');
            return mapRowToUserSafe(rows[0]);
        });
    }
    /**
     * Hard delete: actually remove the row from the database.
     */
    static hardDelete(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            // Actually DELETE the row (current code just soft deletes)
            const { rowCount } = yield db.query(`DELETE FROM users WHERE id = $1::uuid`, [userId]);
            if (rowCount === 0)
                throw new Error('User not found');
            // No return needed since row is gone
        });
    }
    /**
     * Example: mark user paid based on Stripe PaymentIntent (idempotent pattern).
     * NOTE: This assumes you have a payments table - adjust as needed for your subscription system
     */
    static markUserPaidFromIntent(userId, paymentIntentId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            return db.runInTransaction((tx) => __awaiter(this, void 0, void 0, function* () {
                // Ensure a payments table with UNIQUE(payment_intent_id) exists
                yield tx.query(`INSERT INTO payments (user_id, payment_intent_id, status)
         VALUES ($1::uuid, $2, 'succeeded')
         ON CONFLICT (payment_intent_id) DO NOTHING`, [userId, paymentIntentId]);
                const { rows } = yield tx.query(`UPDATE users
            SET updated_at = NOW()
          WHERE id = $1::uuid
          RETURNING id, email, name, status, subscription_tier, subscription_expires_at,
                    settings, deleted_at, created_at, updated_at`, [userId]);
                if (!rows[0])
                    throw new Error('User not found');
                return mapRowToUserSafe(rows[0]);
            }));
        });
    }
}
exports.UserService = UserService;
