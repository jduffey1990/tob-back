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
exports.PostgresService = void 0;
// users/src/controllers/postgres.service.ts
const pg_1 = require("pg");
class PostgresService {
    constructor() {
        this.pool = null;
    }
    static getInstance() {
        if (!PostgresService.instance) {
            PostgresService.instance = new PostgresService();
        }
        return PostgresService.instance;
    }
    /**
     * Initialize a Pool once. Safe to call multiple times.
     * Uses DATABASE_URL if present; otherwise PG* vars.
     */
    connect(config) {
        if (this.pool)
            return this.pool;
        const useUrl = process.env.DATABASE_URL;
        const isProd = process.env.NODE_ENV === 'production';
        const base = useUrl
            ? {
                connectionString: useUrl,
                // Many managed Postgres providers require SSL in prod.
                ssl: isProd ? { rejectUnauthorized: false } : undefined,
            }
            : {
                host: process.env.PGHOST || 'localhost',
                port: Number(process.env.PGPORT || 5432),
                user: process.env.PGUSER || 'postgres',
                password: process.env.PGPASSWORD || undefined,
                database: process.env.PGDATABASE || 'busterbrackets',
            };
        this.pool = new pg_1.Pool(Object.assign(Object.assign({}, base), config));
        this.pool.on('error', (err) => {
            // This is important so the app doesn’t silently hang on idle client errors.
            console.error('[Postgres pool error]', err);
        });
        return this.pool;
    }
    /**
     * Simple query helper for one-off queries.
     * Ensure connect() was called during app bootstrap.
     */
    query(text, params) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.pool)
                throw new Error('PostgresService not connected. Call connect() first.');
            return this.pool.query(text, params);
        });
    }
    /**
     * Get a client for multi-statement work (e.g., transactions).
     * You MUST release() the client, ideally via runInTransaction().
     */
    getClient() {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.pool)
                throw new Error('PostgresService not connected. Call connect() first.');
            return this.pool.connect();
        });
    }
    /**
     * Transaction helper with automatic COMMIT/ROLLBACK + release.
     * Usage:
     *   await db.runInTransaction(async (tx) => {
     *     await tx.query('INSERT ...');
     *     await tx.query('UPDATE ...');
     *   });
     */
    runInTransaction(fn) {
        return __awaiter(this, void 0, void 0, function* () {
            const client = yield this.getClient();
            try {
                yield client.query('BEGIN');
                const result = yield fn(client);
                yield client.query('COMMIT');
                return result;
            }
            catch (err) {
                try {
                    yield client.query('ROLLBACK');
                }
                catch (rollbackErr) {
                    console.error('[Postgres rollback error]', rollbackErr);
                }
                throw err;
            }
            finally {
                client.release();
            }
        });
    }
    /**
     * Graceful shutdown.
     */
    disconnect() {
        return __awaiter(this, void 0, void 0, function* () {
            if (this.pool) {
                yield this.pool.end();
                this.pool = null;
            }
        });
    }
}
exports.PostgresService = PostgresService;
