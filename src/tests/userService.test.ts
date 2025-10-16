// src/tests/usersTests.test.ts
import { UserService, UserSafe } from '../controllers/userService';
import { PostgresService } from '../controllers/postgres.service';

// Mock the PostgresService
jest.mock('../controllers/postgres.service');

describe('UserService', () => {
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create mock database instance
    mockDb = {
      query: jest.fn(),
      runInTransaction: jest.fn(),
    };

    // Mock getInstance to return our mock db
    (PostgresService.getInstance as jest.Mock).mockReturnValue(mockDb);
  });

  describe('findAllUsers', () => {
    it('should return all users ordered by created_at DESC', async () => {
      const mockRows = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          company_id: '123e4567-e89b-12d3-a456-426614174001',
          email: 'user1@example.com',
          name: 'User One',
          status: 'active',
          deleted_at: null,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01'),
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174002',
          company_id: null,
          email: 'user2@example.com',
          name: 'User Two',
          status: 'inactive',
          deleted_at: null,
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-02'),
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRows });

      const result = await UserService.findAllUsers();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, company_id, email, name, status, deleted_at, created_at, updated_at')
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        companyId: '123e4567-e89b-12d3-a456-426614174001',
        email: 'user1@example.com',
        name: 'User One',
        status: 'active',
        deletedAt: null,
        createdAt: mockRows[0].created_at,
        updatedAt: mockRows[0].updated_at,
      });
      expect(result[1].companyId).toBeNull();
    });

    it('should return empty array when no users exist', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await UserService.findAllUsers();

      expect(result).toEqual([]);
    });
  });

  describe('findUserById', () => {
    it('should return a user when found', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: '123e4567-e89b-12d3-a456-426614174001',
        email: 'user@example.com',
        name: 'Test User',
        status: 'active',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await UserService.findUserById('123e4567-e89b-12d3-a456-426614174000');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1::uuid'),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
      expect(result).toEqual({
        id: mockRow.id,
        companyId: mockRow.company_id,
        email: mockRow.email,
        name: mockRow.name,
        status: mockRow.status,
        deletedAt: null,
        createdAt: mockRow.created_at,
        updatedAt: mockRow.updated_at,
      });
    });

    it('should return null when user not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await UserService.findUserById('nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('should create a user with all fields', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: '123e4567-e89b-12d3-a456-426614174001',
        email: 'newuser@example.com',
        name: 'New User',
        status: 'active',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await UserService.createUser({
        email: 'newuser@example.com',
        name: 'New User',
        passwordHash: 'hashed_password_123',
        companyId: '123e4567-e89b-12d3-a456-426614174001',
        status: 'active',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        ['123e4567-e89b-12d3-a456-426614174001', 'newuser@example.com', 'hashed_password_123', 'New User', 'active']
      );
      expect(result.email).toBe('newuser@example.com');
      expect(result.name).toBe('New User');
    });

    it('should create a user with default status when not provided', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: null,
        email: 'newuser@example.com',
        name: 'New User',
        status: 'active',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01'),
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await UserService.createUser({
        email: 'newuser@example.com',
        name: 'New User',
        passwordHash: 'hashed_password_123',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        [null, 'newuser@example.com', 'hashed_password_123', 'New User', 'active']
      );
      expect(result.status).toBe('active');
    });

    it('should throw error when email already exists (duplicate key)', async () => {
      const duplicateError = new Error('duplicate key error');
      (duplicateError as any).code = '23505';
      mockDb.query.mockRejectedValue(duplicateError);

      await expect(
        UserService.createUser({
          email: 'duplicate@example.com',
          name: 'Duplicate User',
          passwordHash: 'hashed_password_123',
        })
      ).rejects.toThrow('duplicate key value violates unique constraint');
    });

    it('should rethrow other database errors', async () => {
      const otherError = new Error('Database connection failed');
      mockDb.query.mockRejectedValue(otherError);

      await expect(
        UserService.createUser({
          email: 'user@example.com',
          name: 'User',
          passwordHash: 'hashed_password_123',
        })
      ).rejects.toThrow('Database connection failed');
    });
  });

  describe('userUpdateInfo', () => {
    it('should update user name and email', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: '123e4567-e89b-12d3-a456-426614174001',
        email: 'updated@example.com',
        name: 'John Doe',
        status: 'active',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await UserService.updateUser('123e4567-e89b-12d3-a456-426614174000', {
        name: 'John Doe',
        email: 'updated@example.com',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        ['John Doe', 'updated@example.com', '123e4567-e89b-12d3-a456-426614174000']
      );
      expect(result.name).toBe('John Doe');
      expect(result.email).toBe('updated@example.com');
    });

    it('should handle single name correctly', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: null,
        email: 'user@example.com',
        name: 'Madonna',
        status: 'active',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await UserService.updateUser('123e4567-e89b-12d3-a456-426614174000', {
        name: 'Madonna',
        email: 'user@example.com',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.anything(),
        ['Madonna', 'user@example.com', '123e4567-e89b-12d3-a456-426614174000']
      );
      expect(result.name).toBe('Madonna');
    });

    it('should throw error when user not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        UserService.updateUser('nonexistent-id', {
          name: 'John Doe',
          email: 'user@example.com',
        })
      ).rejects.toThrow('User not found');
    });

    it('should update only provided fields', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: null,
        email: 'user@example.com',
        name: 'John Doe',
        status: 'inactive',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await UserService.updateUser('123e4567-e89b-12d3-a456-426614174000', {
        status: 'inactive',
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users'),
        ['inactive', '123e4567-e89b-12d3-a456-426614174000']
      );
      expect(result.status).toBe('inactive');
    });
  });

  describe('activateUser', () => {
    it('should activate an inactive user', async () => {
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: null,
        email: 'user@example.com',
        name: 'Test User',
        status: 'active',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await UserService.activateUser('123e4567-e89b-12d3-a456-426614174000');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'active'"),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining("AND status = 'inactive'"),
        expect.anything()
      );
      expect(result.status).toBe('active');
    });

    it('should throw error when user not found or already active', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        UserService.activateUser('123e4567-e89b-12d3-a456-426614174000')
      ).rejects.toThrow('Activation failed: user not found or already active');
    });
  });

  describe('softDelete', () => {
    it('should soft delete a user by setting deleted_at', async () => {
      const now = new Date();
      const mockRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: null,
        email: 'user@example.com',
        name: 'Test User',
        status: 'active',
        deleted_at: now,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await UserService.softDelete('123e4567-e89b-12d3-a456-426614174000');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET deleted_at = NOW()'),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
      expect(result.deletedAt).toEqual(now);
    });

    it('should throw error when user not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        UserService.softDelete('nonexistent-id')
      ).rejects.toThrow('User not found');
    });
  });

  describe('markUserPaidFromIntent', () => {
    it('should mark user as paid and insert payment record in transaction', async () => {
      const mockUserRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: null,
        email: 'user@example.com',
        name: 'Test User',
        status: 'active',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      const mockTx = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // First call: INSERT payment
          .mockResolvedValueOnce({ rows: [mockUserRow] }), // Second call: UPDATE user
      };

      mockDb.runInTransaction.mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await UserService.markUserPaidFromIntent(
        '123e4567-e89b-12d3-a456-426614174000',
        'pi_1234567890'
      );

      expect(mockDb.runInTransaction).toHaveBeenCalled();
      expect(mockTx.query).toHaveBeenCalledTimes(2);
      expect(mockTx.query).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('INSERT INTO payments'),
        expect.arrayContaining(['123e4567-e89b-12d3-a456-426614174000', 'pi_1234567890'])
      );
      expect(mockTx.query).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('UPDATE users'),
        ['123e4567-e89b-12d3-a456-426614174000']
      );
      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should handle idempotent payment insertion (ON CONFLICT DO NOTHING)', async () => {
      const mockUserRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        company_id: null,
        email: 'user@example.com',
        name: 'Test User',
        status: 'active',
        deleted_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
      };

      const mockTx = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // INSERT with conflict (no rows returned)
          .mockResolvedValueOnce({ rows: [mockUserRow] }), // UPDATE user
      };

      mockDb.runInTransaction.mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const result = await UserService.markUserPaidFromIntent(
        '123e4567-e89b-12d3-a456-426614174000',
        'pi_1234567890'
      );

      expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
    });

    it('should throw error when user not found in transaction', async () => {
      const mockTx = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // INSERT payment
          .mockResolvedValueOnce({ rows: [] }), // UPDATE user (not found)
      };

      mockDb.runInTransaction.mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await expect(
        UserService.markUserPaidFromIntent('nonexistent-id', 'pi_1234567890')
      ).rejects.toThrow('User not found');
    });

    it('should rollback transaction on error', async () => {
      const mockTx = {
        query: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      mockDb.runInTransaction.mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await expect(
        UserService.markUserPaidFromIntent('123e4567-e89b-12d3-a456-426614174000', 'pi_1234567890')
      ).rejects.toThrow('Database error');
    });
  });
});