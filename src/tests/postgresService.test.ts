// src/tests/postgresService.test.ts
import { PostgresService } from '../controllers/postgres.service';
import { Pool, PoolClient } from 'pg';

// Mock the pg module
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
  };
  return {
    Pool: jest.fn(() => mPool),
  };
});

describe('PostgresService', () => {
  let service: PostgresService;
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Suppress console.log for cleaner test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    
    // Get fresh instance
    service = PostgresService.getInstance();
    
    // Reset environment variables
    delete process.env.DATABASE_URL;
    delete process.env.NODE_ENV;
    delete process.env.PGHOST;
    delete process.env.PGPORT;
    delete process.env.PGUSER;
    delete process.env.PGPASSWORD;
    delete process.env.PGDATABASE;

    // Get the mock pool that will be created
    mockPool = {
      query: jest.fn(),
      connect: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
    };
    (Pool as jest.MockedClass<typeof Pool>).mockImplementation(() => mockPool);
  });

  afterEach(async () => {
    // Restore console mocks
    jest.restoreAllMocks();
    
    // Disconnect after each test to reset state
    await service.disconnect();
  });

  describe('getInstance', () => {
    it('should return the same instance (singleton pattern)', () => {
      const instance1 = PostgresService.getInstance();
      const instance2 = PostgresService.getInstance();
      
      expect(instance1).toBe(instance2);
    });
  });

  describe('connect', () => {
    it('should create a pool with DATABASE_URL in production', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
      process.env.NODE_ENV = 'production';

      service.connect();

      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://user:pass@host:5432/db',
        ssl: { rejectUnauthorized: false },
      });
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should create a pool with DATABASE_URL without SSL in development', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host:5432/db';
      process.env.NODE_ENV = 'development';

      service.connect();

      expect(Pool).toHaveBeenCalledWith({
        connectionString: 'postgresql://user:pass@host:5432/db',
        ssl: undefined,
      });
    });

    it('should create a pool with PG environment variables when no DATABASE_URL', () => {
      process.env.PGHOST = 'custom-host';
      process.env.PGPORT = '5433';
      process.env.PGUSER = 'myuser';
      process.env.PGPASSWORD = 'mypassword';
      process.env.PGDATABASE = 'mydb';

      service.connect();

      expect(Pool).toHaveBeenCalledWith({
        host: 'custom-host',
        port: 5433,
        user: 'myuser',
        password: 'mypassword',
        database: 'mydb',
      });
    });

    it('should use default values when no environment variables are set', () => {
      service.connect();

      expect(Pool).toHaveBeenCalledWith({
        host: 'localhost',
        port: 5434,
        user: 'tobapp',
        password: 'tobapp',
        database: 'towerofbabble',
      });
    });

    it('should merge custom config with base config', () => {
      service.connect({ max: 20, idleTimeoutMillis: 30000 });

      expect(Pool).toHaveBeenCalledWith(
        expect.objectContaining({
          max: 20,
          idleTimeoutMillis: 30000,
          host: 'localhost',
        })
      );
    });

    it('should return existing pool on subsequent calls', () => {
      const pool1 = service.connect();
      const pool2 = service.connect();

      expect(pool1).toBe(pool2);
      expect(Pool).toHaveBeenCalledTimes(1);
    });

    it('should register error handler on pool', () => {
      service.connect();
      
      expect(mockPool.on).toHaveBeenCalledWith('error', expect.any(Function));
      
      // Trigger the error handler
      const errorHandler = mockPool.on.mock.calls[0][1];
      const testError = new Error('Pool error');
      errorHandler(testError);
      
      // Verify error was logged (console.error is already mocked in beforeEach)
      expect(console.error).toHaveBeenCalledWith('[Postgres pool error]', testError);
    });
  });

  describe('query', () => {
    beforeEach(() => {
      service.connect();
    });

    it('should execute a query without parameters', async () => {
      const mockResult = { rows: [{ id: 1 }], rowCount: 1 };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM users');

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users', undefined);
      expect(result).toEqual(mockResult);
    });

    it('should execute a query with parameters', async () => {
      const mockResult = { rows: [{ id: 1, name: 'John' }], rowCount: 1 };
      mockPool.query.mockResolvedValue(mockResult);

      const result = await service.query('SELECT * FROM users WHERE id = $1', [1]);

      expect(mockPool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [1]);
      expect(result).toEqual(mockResult);
    });

    it('should handle various parameter types', async () => {
      const mockResult = { rows: [], rowCount: 0 };
      mockPool.query.mockResolvedValue(mockResult);

      const params = [
        'string',
        123,
        true,
        null,
        new Date('2024-01-01'),
        Buffer.from('test'),
        { key: 'value' },
      ];

      await service.query('INSERT INTO test VALUES ($1, $2, $3, $4, $5, $6, $7)', params);

      expect(mockPool.query).toHaveBeenCalledWith(
        'INSERT INTO test VALUES ($1, $2, $3, $4, $5, $6, $7)',
        params
      );
    });

    it('should throw error if not connected', async () => {
      await service.disconnect();

      await expect(service.query('SELECT 1')).rejects.toThrow(
        'PostgresService not connected. Call connect() first.'
      );
    });

    it('should propagate query errors', async () => {
      const dbError = new Error('Database error');
      mockPool.query.mockRejectedValue(dbError);

      await expect(service.query('INVALID SQL')).rejects.toThrow('Database error');
    });
  });

  describe('getClient', () => {
    beforeEach(() => {
      service.connect();
    });

    it('should return a pool client', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);

      const client = await service.getClient();

      expect(mockPool.connect).toHaveBeenCalled();
      expect(client).toBe(mockClient);
    });

    it('should throw error if not connected', async () => {
      await service.disconnect();

      await expect(service.getClient()).rejects.toThrow(
        'PostgresService not connected. Call connect() first.'
      );
    });

    it('should propagate connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockPool.connect.mockRejectedValue(connectionError);

      await expect(service.getClient()).rejects.toThrow('Connection failed');
    });
  });

  describe('runInTransaction', () => {
    let mockClient: any;

    beforeEach(() => {
      service.connect();
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      mockPool.connect.mockResolvedValue(mockClient);
    });

    it('should execute transaction with BEGIN, callback, and COMMIT', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });

      const callback = jest.fn().mockResolvedValue('success');

      const result = await service.runInTransaction(callback);

      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(callback).toHaveBeenCalledWith(mockClient);
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
      expect(result).toBe('success');
    });

    it('should rollback on callback error and rethrow', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 0 });
      
      const callbackError = new Error('Callback failed');
      const callback = jest.fn().mockRejectedValue(callbackError);

      await expect(service.runInTransaction(callback)).rejects.toThrow('Callback failed');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.query).not.toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should release client even if rollback fails', async () => {
      mockClient.query
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN succeeds
        .mockRejectedValueOnce(new Error('Rollback failed')); // ROLLBACK fails

      const callback = jest.fn().mockRejectedValue(new Error('Callback failed'));

      await expect(service.runInTransaction(callback)).rejects.toThrow('Callback failed');

      expect(mockClient.release).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith(
        '[Postgres rollback error]',
        expect.any(Error)
      );
    });

    it('should execute multiple queries in transaction', async () => {
      mockClient.query.mockResolvedValue({ rows: [], rowCount: 1 });

      const callback = async (tx: PoolClient) => {
        await tx.query('INSERT INTO users VALUES ($1)', ['user1']);
        await tx.query('INSERT INTO orders VALUES ($1)', ['order1']);
        return 'complete';
      };

      const result = await service.runInTransaction(callback);

      expect(mockClient.query).toHaveBeenCalledTimes(4); // BEGIN, INSERT, INSERT, COMMIT
      expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
      expect(mockClient.query).toHaveBeenNthCalledWith(2, 'INSERT INTO users VALUES ($1)', ['user1']);
      expect(mockClient.query).toHaveBeenNthCalledWith(3, 'INSERT INTO orders VALUES ($1)', ['order1']);
      expect(mockClient.query).toHaveBeenNthCalledWith(4, 'COMMIT');
      expect(result).toBe('complete');
    });

    it('should handle transaction returning complex objects', async () => {
      mockClient.query.mockResolvedValue({ rows: [{ id: 1, name: 'test' }], rowCount: 1 });

      const callback = async (tx: PoolClient) => {
        const result = await tx.query('SELECT * FROM users');
        return { data: result.rows, count: result.rowCount };
      };

      const result = await service.runInTransaction(callback);

      expect(result).toEqual({
        data: [{ id: 1, name: 'test' }],
        count: 1,
      });
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('disconnect', () => {
    it('should end the pool and set it to null', async () => {
      service.connect();

      await service.disconnect();

      expect(mockPool.end).toHaveBeenCalled();

      // Should be able to connect again after disconnect
      service.connect();
      expect(Pool).toHaveBeenCalledTimes(2);
    });

    it('should not throw if disconnect is called without connecting first', async () => {
      await expect(service.disconnect()).resolves.not.toThrow();
      expect(mockPool.end).not.toHaveBeenCalled();
    });

    it('should not throw if disconnect is called multiple times', async () => {
      service.connect();

      await service.disconnect();
      await service.disconnect();

      expect(mockPool.end).toHaveBeenCalledTimes(1);
    });

    it('should handle pool.end() errors gracefully', async () => {
      service.connect();
      
      // Mock the end method to reject after the pool is created
      mockPool.end.mockRejectedValueOnce(new Error('End failed'));

      await expect(service.disconnect()).rejects.toThrow('End failed');
    });
  });
});