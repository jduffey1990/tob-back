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
exports.AuthService = void 0;
// src/controllers/authService.ts
const bcrypt_1 = __importDefault(require("bcrypt"));
const jwt_1 = __importDefault(require("@hapi/jwt"));
const dotenv_1 = __importDefault(require("dotenv"));
const postgres_service_1 = require("./postgres.service");
dotenv_1.default.config();
const jwtSecret = process.env.JWT_SECRET || '';
function rowToUserSafe(row) {
    var _a, _b;
    return {
        id: row.id,
        companyId: (_a = row.company_id) !== null && _a !== void 0 ? _a : null,
        email: row.email,
        name: row.name,
        status: row.status,
        deletedAt: (_b = row.deleted_at) !== null && _b !== void 0 ? _b : null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}
class AuthService {
    /**
     * Validate user credentials and issue a JWT on success.
     */
    static validateUser(_request, email, password, _h) {
        return __awaiter(this, void 0, void 0, function* () {
            const db = postgres_service_1.PostgresService.getInstance();
            // Load the user by email (case-insensitive), include password_hash for verification
            const { rows } = yield db.query(`SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at, password_hash
         FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1`, [email]);
            const row = rows[0];
            if (!row)
                return { isValid: false };
            const passwordOk = yield bcrypt_1.default.compare(password, row.password_hash);
            if (!passwordOk)
                return { isValid: false };
            // Build a safe user object (exclude password_hash)
            const safe = rowToUserSafe(row);
            // Create JWT (keep payload minimal)
            const token = jwt_1.default.token.generate({ id: safe.id, email: safe.email }, jwtSecret);
            return { isValid: true, credentials: safe, token };
        });
    }
    /**
     * Validate a decoded JWT (Hapi @hapi/jwt validate hook).
     * Accepts a few shapes for `decoded` depending on how Hapi passes artifacts.
     */
    static validateToken(decoded, _request, _h) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            // Handle common shapes: decoded.payload OR decoded.decoded.payload OR decoded
            const payload = (_c = (_b = (_a = decoded === null || decoded === void 0 ? void 0 : decoded.decoded) === null || _a === void 0 ? void 0 : _a.payload) !== null && _b !== void 0 ? _b : decoded === null || decoded === void 0 ? void 0 : decoded.payload) !== null && _c !== void 0 ? _c : decoded;
            const userId = payload === null || payload === void 0 ? void 0 : payload.id;
            if (!userId)
                return { isValid: false };
            const db = postgres_service_1.PostgresService.getInstance();
            const { rows } = yield db.query(`SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at
         FROM users
        WHERE id = $1::uuid
        LIMIT 1`, [userId]);
            const row = rows[0];
            if (!row)
                return { isValid: false };
            return { isValid: true, credentials: rowToUserSafe(row) };
        });
    }
}
exports.AuthService = AuthService;
