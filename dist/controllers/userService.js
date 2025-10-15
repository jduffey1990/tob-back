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
// Map db row -> UserSafe (snake_case -> camelCase)
function mapRowToUser(row) {
    var _a, _b;
    return {
        id: row.id,
        companyId: (_a = row.company_id) !== null && _a !== void 0 ? _a : null,
        email: row.email,
        name: row.name,
        status: row.status,
        deletedAt: (_b = row.deleted_at) !== null && _b !== void 0 ? _b : null,
        createdAt: row.created_at, // node-postgres returns Date for timestamptz
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
            const { rows } = yield db.query(`SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at
       FROM users
       ORDER BY created_at DESC`);
            return rows.map(mapRowToUser);
        });
    }
    /**
     * Get one user by id (safe).
     */
    static findUserById(id) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const { rows } = yield db.query(`SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at
         FROM users
        WHERE id = $1::uuid
        LIMIT 1`, [id]);
            return rows[0] ? mapRowToUser(rows[0]) : null;
        });
    }
    /**
     * Create a user. Accept a passwordHash (already hashed with bcrypt/argon2).
     * UNIQUE(email) enforced in DB; we convert 23505 to your legacy duplicate message.
     */
    static createUser(input) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b;
            const db = postgres_service_1.PostgresService.getInstance();
            const companyId = (_a = input.companyId) !== null && _a !== void 0 ? _a : null;
            const status = (_b = input.status) !== null && _b !== void 0 ? _b : 'active';
            try {
                const { rows } = yield db.query(`INSERT INTO users (company_id, email, password_hash, name, status)
         VALUES ($1::uuid, $2, $3, $4, $5)
         RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`, [companyId, input.email, input.passwordHash, input.name, status]);
                return mapRowToUser(rows[0]);
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
     * Update user basic info by id (name + email).
     */
    static userUpdateInfo(userId, account) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const fullName = `${account.firstName} ${account.lastName}`.trim();
            const { rows } = yield db.query(`UPDATE users
          SET name = $1,
              email = $2
        WHERE id = $3::uuid
        RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`, [fullName, account.email, userId]);
            if (!rows[0])
                throw new Error('User not found');
            return mapRowToUser(rows[0]);
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
        RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`, [userId]);
            if (!rows[0]) {
                // Not found OR already active/disabled
                throw new Error('Activation failed: user not found or already active');
            }
            // reuse your existing row→safe mapper if exported
            return mapRowToUser(rows[0]);
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
        RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`, [userId]);
            if (!rows[0])
                throw new Error('User not found');
            return mapRowToUser(rows[0]);
        });
    }
    /**
     * Example: mark user paid based on Stripe PaymentIntent (idempotent pattern).
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
          RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at`, [userId]);
                if (!rows[0])
                    throw new Error('User not found');
                return mapRowToUser(rows[0]);
            }));
        });
    }
}
exports.UserService = UserService;
