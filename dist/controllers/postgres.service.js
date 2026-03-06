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
// Threshold in ms — any query slower than this gets a warning log
const SLOW_QUERY_THRESHOLD_MS = 500;
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
                port: Number(process.env.PGPORT || 5434),
                user: process.env.PGUSER || 'tobapp',
                password: process.env.PGPASSWORD || 'tobapp',
                database: process.env.PGDATABASE || 'towerofbabble',
            };
        this.pool = new pg_1.Pool(Object.assign(Object.assign({}, base), config));
        this.pool.on('error', (err) => {
            console.error(JSON.stringify({
                level: 'error',
                type: 'db_pool_error',
                message: err.message,
                stack: err.stack,
                timestamp: new Date().toISOString(),
            }));
        });
        this.pool.on('connect', () => {
            console.log(JSON.stringify({
                level: 'info',
                type: 'db_connection',
                message: 'New pool client connected',
                timestamp: new Date().toISOString(),
            }));
        });
        return this.pool;
    }
    /**
     * Simple query helper for one-off queries.
     * Logs slow queries (> 500ms) with the SQL text for debugging.
     */
    query(text, params) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.pool)
                throw new Error('PostgresService not connected. Call connect() first.');
            const start = Date.now();
            try {
                const result = yield this.pool.query(text, params);
                const duration_ms = Date.now() - start;
                // Log slow queries so you catch missing indexes before they become outages
                if (duration_ms > SLOW_QUERY_THRESHOLD_MS) {
                    console.warn(JSON.stringify({
                        level: 'warn',
                        type: 'slow_query',
                        duration_ms,
                        rowCount: result.rowCount,
                        // Log the parameterized SQL, NOT the actual param values (no PII leaks)
                        query: text.substring(0, 200),
                        timestamp: new Date().toISOString(),
                    }));
                }
                return result;
            }
            catch (err) {
                const duration_ms = Date.now() - start;
                console.error(JSON.stringify({
                    level: 'error',
                    type: 'db_query_error',
                    duration_ms,
                    query: text.substring(0, 200),
                    message: err.message,
                    code: err.code, // Postgres error codes like '23505' (unique violation), '42P01' (undefined table)
                    timestamp: new Date().toISOString(),
                }));
                throw err;
            }
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
            const start = Date.now();
            try {
                yield client.query('BEGIN');
                const result = yield fn(client);
                yield client.query('COMMIT');
                const duration_ms = Date.now() - start;
                if (duration_ms > SLOW_QUERY_THRESHOLD_MS) {
                    console.warn(JSON.stringify({
                        level: 'warn',
                        type: 'slow_transaction',
                        duration_ms,
                        timestamp: new Date().toISOString(),
                    }));
                }
                return result;
            }
            catch (err) {
                try {
                    yield client.query('ROLLBACK');
                }
                catch (rollbackErr) {
                    console.error(JSON.stringify({
                        level: 'error',
                        type: 'db_rollback_error',
                        message: rollbackErr.message,
                        timestamp: new Date().toISOString(),
                    }));
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
