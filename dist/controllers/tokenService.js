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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activationTokenService = exports.ActivationTokenService = void 0;
// src/services/activationToken.service.ts
const crypto_1 = __importDefault(require("crypto"));
const postgres_service_1 = require("./postgres.service");
// Token expiry duration: 72 hours (3 days)
const TOKEN_EXPIRY_HOURS = 72;
class ActivationTokenService {
    /**
     * Generate a new activation token for a user
     */
    createActivationToken(userId, email) {
        return __awaiter(this, void 0, void 0, function* () {
            // Generate cryptographically secure random token
            const token = crypto_1.default.randomBytes(32).toString('hex'); // 64 hex characters
            const expiresAt = new Date();
            expiresAt.setHours(expiresAt.getHours() + TOKEN_EXPIRY_HOURS);
            const db = postgres_service_1.PostgresService.getInstance();
            // Insert into database
            yield db.query(`INSERT INTO activation_tokens (user_id, email, token, expires_at)
       VALUES ($1, $2, $3, $4)`, [userId, email, token, expiresAt]);
            return token;
        });
    }
    /**
     * Validate and retrieve activation token
     * Returns null if token is invalid, expired, or already used
     */
    validateToken(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const result = yield db.query(`SELECT * FROM activation_tokens
       WHERE token = $1
       AND used_at IS NULL
       AND expires_at > NOW()`, [token]);
            if (result.rows.length === 0) {
                return null;
            }
            const row = result.rows[0];
            // Map snake_case DB columns to camelCase
            const tokenData = {
                id: row.id,
                userId: row.user_id, // ✅ Map snake_case to camelCase
                email: row.email,
                token: row.token,
                expiresAt: row.expires_at,
                createdAt: row.created_at,
                usedAt: row.used_at
            };
            return tokenData;
        });
    }
    /**
     * Delete all tokens for a specific user
     * Useful when user requests a new activation email
     */
    deleteUserTokens(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            yield db.query(`DELETE FROM activation_tokens
       WHERE user_id = $1`, [userId]);
        });
    }
    /**
     * Clean up expired tokens (should be run periodically via cron)
     */
    cleanupExpiredTokens() {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const result = yield db.query(`DELETE FROM activation_tokens
       WHERE expires_at < NOW()
       RETURNING id`);
            return result.rowCount || 0;
        });
    }
    /**
     * Check if user has an active (unused, non-expired) token
     */
    hasActiveToken(userId) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            const result = yield db.query(`SELECT EXISTS(
        SELECT 1 FROM activation_tokens
        WHERE user_id = $1
        AND used_at IS NULL
        AND expires_at > NOW()
      ) as has_token`, [userId]);
            return result.rows[0].has_token;
        });
    }
    /**
     * Resend activation - delete old tokens and create new one
     */
    resendActivationToken(userId, email) {
        return __awaiter(this, void 0, void 0, function* () {
            // Delete any existing tokens for this user
            yield this.deleteUserTokens(userId);
            // Create a new token
            return yield this.createActivationToken(userId, email);
        });
    }
    markTokenAsUsed(token) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            yield db.query(`UPDATE activation_tokens
       SET used_at = NOW()
       WHERE token = $1`, [token]);
        });
    }
}
exports.ActivationTokenService = ActivationTokenService;
// Export singleton instance
exports.activationTokenService = new ActivationTokenService();
