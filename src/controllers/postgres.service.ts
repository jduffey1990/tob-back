// users/src/controllers/postgres.service.ts
import { Pool, PoolClient, QueryResult, PoolConfig } from 'pg';

type QueryParams = Array<string | number | boolean | null | Date | Buffer | object>;

// Threshold in ms — any query slower than this gets a warning log
const SLOW_QUERY_THRESHOLD_MS = 500;

export class PostgresService {
  private static instance: PostgresService;
  private pool: Pool | null = null;

  private constructor() {}

  public static getInstance(): PostgresService {
    if (!PostgresService.instance) {
      PostgresService.instance = new PostgresService();
    }
    return PostgresService.instance;
  }

  /**
   * Initialize a Pool once. Safe to call multiple times.
   * Uses DATABASE_URL if present; otherwise PG* vars.
   */
  public connect(config?: PoolConfig): Pool {
    if (this.pool) return this.pool;

    const useUrl = process.env.DATABASE_URL;
    const isProd = process.env.NODE_ENV === 'production';

    const base: PoolConfig =
      useUrl
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

    this.pool = new Pool({ ...base, ...config });

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
  public async query<T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
    text: string, 
    params?: QueryParams
  ): Promise<QueryResult<T>> {
    if (!this.pool) throw new Error('PostgresService not connected. Call connect() first.');
  
    const start = Date.now();
    
    try {
      const result = await this.pool.query<T>(text, params);
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
    } catch (err: any) {
      const duration_ms = Date.now() - start;
      
      console.error(JSON.stringify({
        level: 'error',
        type: 'db_query_error',
        duration_ms,
        query: text.substring(0, 200),
        message: err.message,
        code: err.code,  // Postgres error codes like '23505' (unique violation), '42P01' (undefined table)
        timestamp: new Date().toISOString(),
      }));

      throw err;
    }
  }

  /**
   * Get a client for multi-statement work (e.g., transactions).
   * You MUST release() the client, ideally via runInTransaction().
   */
  public async getClient(): Promise<PoolClient> {
    if (!this.pool) throw new Error('PostgresService not connected. Call connect() first.');
    return this.pool.connect();
  }

  /**
   * Transaction helper with automatic COMMIT/ROLLBACK + release.
   * Usage:
   *   await db.runInTransaction(async (tx) => {
   *     await tx.query('INSERT ...');
   *     await tx.query('UPDATE ...');
   *   });
   */
    public async runInTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    const start = Date.now();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      
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
    } catch (err: any) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error(JSON.stringify({
          level: 'error',
          type: 'db_rollback_error',
          message: (rollbackErr as Error).message,
          timestamp: new Date().toISOString(),
        }));
      }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Graceful shutdown.
   */
  public async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}
