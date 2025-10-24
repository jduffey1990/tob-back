// users/src/controllers/postgres.service.ts
import { Pool, PoolClient, QueryResult, PoolConfig } from 'pg';

type QueryParams = Array<string | number | boolean | null | Date | Buffer | object>;

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
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER || 'postgres',
            password: process.env.PGPASSWORD || undefined,
            database: process.env.PGDATABASE || 'busterbrackets',
          };

    this.pool = new Pool({ ...base, ...config });

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
  public async query<T extends import('pg').QueryResultRow = import('pg').QueryResultRow>(
    text: string, 
    params?: QueryParams
  ): Promise<QueryResult<T>> {
    if (!this.pool) throw new Error('PostgresService not connected. Call connect() first.');
  
    const start = Date.now();
    const result = await this.pool.query<T>(text, params);
    console.log(`Query took ${Date.now() - start}ms - pool: ${this.pool.totalCount} total, ${this.pool.idleCount} idle, ${this.pool.waitingCount} waiting`);
    
    return result;
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
  public async runInTransaction<T>(fn: (tx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackErr) {
        console.error('[Postgres rollback error]', rollbackErr);
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
