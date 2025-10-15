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
// wsapp-users/src/scripts/seedUsers.ts
const bcrypt_1 = __importDefault(require("bcrypt"));
const postgres_service_1 = require("../controllers/postgres.service");
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
function makeSeedUsers(count = 10) {
    return Array.from({ length: count }, (_v, i) => ({
        email: `user${i + 1}@example.com`,
        name: `User ${i + 1}`,
        password: 'password123',
        status: 'active', // for local convenience
        companyId: null,
    }));
}
function seedUsers() {
    return __awaiter(this, void 0, void 0, function* () {
        const db = postgres_service_1.PostgresService.getInstance();
        db.connect();
        try {
            const seeds = makeSeedUsers(10);
            // Hash once per user
            const hashed = yield Promise.all(seeds.map((u) => __awaiter(this, void 0, void 0, function* () {
                return (Object.assign(Object.assign({}, u), { passwordHash: yield bcrypt_1.default.hash(u.password, 10) }));
            })));
            // Build bulk INSERT
            const cols = ['company_id', 'email', 'password_hash', 'name', 'status'];
            const valuesSql = [];
            const params = [];
            hashed.forEach((u, idx) => {
                var _a, _b;
                const base = idx * cols.length;
                params.push((_a = u.companyId) !== null && _a !== void 0 ? _a : null, u.email.toLowerCase(), u.passwordHash, u.name, (_b = u.status) !== null && _b !== void 0 ? _b : 'active');
                valuesSql.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
            });
            const sql = `
      INSERT INTO users (${cols.join(', ')})
      VALUES ${valuesSql.join(', ')}
      ON CONFLICT (email) DO NOTHING
      RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at
    `;
            const { rows } = yield db.query(sql, params);
            const users = rows.map(rowToUserSafe);
            console.log(`✅ Seeded ${users.length} users`);
            users.forEach((u) => console.log(`${u.email} (${u.id})`));
        }
        catch (err) {
            console.error('❌ Error seeding users:', err);
            process.exitCode = 1;
        }
        finally {
            yield db.disconnect();
        }
    });
}
seedUsers();
