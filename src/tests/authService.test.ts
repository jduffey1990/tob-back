// src/tests/authService.test.ts
import { AuthService } from '../controllers/authService';
import { PostgresService } from '../controllers/postgres.service';
import bcrypt from 'bcrypt';
import Jwt from '@hapi/jwt';
import { Request, ResponseToolkit } from '@hapi/hapi';

// Mock dependencies
jest.mock('../controllers/postgres.service');
jest.mock('bcrypt');
jest.mock('@hapi/jwt');

describe('AuthService', () => {
  let mockDb: any;
  let mockRequest: Partial<Request>;
  let mockH: Partial<ResponseToolkit>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database instance
    mockDb = {
      query: jest.fn(),
    };
    (PostgresService.getInstance as jest.Mock).mockReturnValue(mockDb);

    // Mock request and response toolkit (not used but required by signature)
    mockRequest = {};
    mockH = {};

    // Set JWT_SECRET for tests
    process.env.JWT_SECRET = 'test-secret-key';
  });

  afterEach(() => {
    delete process.env.JWT_SECRET;
  });

  describe('validateUser', () => {
    const validEmail = 'user@example.com';
    const validPassword = 'password123';
    const hashedPassword = '$2b$10$hashedpassword';

    const mockUserRow = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'user@example.com',
      name: 'Test User',
      status: 'active',
      subscription_tier: 'free',
      subscription_expires_at: null,
      deleted_at: null,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
      password_hash: hashedPassword,
    };

    it('should validate user with correct credentials and return token', async () => {
      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (Jwt.token.generate as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await AuthService.validateUser(
        mockRequest as Request,
        validEmail,
        validPassword,
        mockH as ResponseToolkit
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE LOWER(email) = LOWER($1)'),
        [validEmail]
      );
      expect(bcrypt.compare).toHaveBeenCalledWith(validPassword, hashedPassword);
      expect(Jwt.token.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          id: mockUserRow.id,
          email: mockUserRow.email,
          name: mockUserRow.name,
          subscriptionTier: mockUserRow.subscription_tier
        }),
        expect.anything(),
        expect.anything()
      );
      expect(result).toEqual({
        isValid: true,
        credentials: {
          id: mockUserRow.id,
          email: mockUserRow.email,
          name: mockUserRow.name,
          status: mockUserRow.status,
          subscriptionTier: mockUserRow.subscription_tier,
          subscriptionExpiresAt: null,
          deletedAt: null,
          createdAt: mockUserRow.created_at,
          updatedAt: mockUserRow.updated_at,
        },
        token: 'mock-jwt-token',
      });
    });

    it('should handle case-insensitive email lookup', async () => {
      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (Jwt.token.generate as jest.Mock).mockReturnValue('mock-jwt-token');

      await AuthService.validateUser(
        mockRequest as Request,
        'USER@EXAMPLE.COM',
        validPassword,
        mockH as ResponseToolkit
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE LOWER(email) = LOWER($1)'),
        ['USER@EXAMPLE.COM']
      );
    });

    it('should return isValid false when user not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await AuthService.validateUser(
        mockRequest as Request,
        'nonexistent@example.com',
        validPassword,
        mockH as ResponseToolkit
      );

      expect(result).toEqual({ isValid: false });
      expect(bcrypt.compare).not.toHaveBeenCalled();
      expect(Jwt.token.generate).not.toHaveBeenCalled();
    });

    it('should return isValid false when password is incorrect', async () => {
      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await AuthService.validateUser(
        mockRequest as Request,
        validEmail,
        'wrongpassword',
        mockH as ResponseToolkit
      );

      expect(result).toEqual({ isValid: false });
      expect(bcrypt.compare).toHaveBeenCalledWith('wrongpassword', hashedPassword);
      expect(Jwt.token.generate).not.toHaveBeenCalled();
    });

    it('should exclude password_hash from returned credentials', async () => {
      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (Jwt.token.generate as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await AuthService.validateUser(
        mockRequest as Request,
        validEmail,
        validPassword,
        mockH as ResponseToolkit
      );

      expect(result.credentials).toBeDefined();
      expect(result.credentials).not.toHaveProperty('passwordHash');
      expect(result.credentials).not.toHaveProperty('password_hash');
    });

    it('should handle Pro user with expiration date', async () => {
      const proUser = {
        ...mockUserRow,
        subscription_tier: 'pro',
        subscription_expires_at: new Date('2026-12-31'),
      };
      mockDb.query.mockResolvedValue({ rows: [proUser] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (Jwt.token.generate as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await AuthService.validateUser(
        mockRequest as Request,
        validEmail,
        validPassword,
        mockH as ResponseToolkit
      );

      expect(result.credentials?.subscriptionTier).toBe('pro');
      expect(result.credentials?.subscriptionExpiresAt).toEqual(new Date('2026-12-31'));
    });

    it('should handle Lifetime user', async () => {
      const lifetimeUser = {
        ...mockUserRow,
        subscription_tier: 'lifetime',
        subscription_expires_at: null,
      };
      mockDb.query.mockResolvedValue({ rows: [lifetimeUser] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (Jwt.token.generate as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await AuthService.validateUser(
        mockRequest as Request,
        validEmail,
        validPassword,
        mockH as ResponseToolkit
      );

      expect(result.credentials?.subscriptionTier).toBe('lifetime');
      expect(result.credentials?.subscriptionExpiresAt).toBeNull();
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.query.mockRejectedValue(dbError);

      await expect(
        AuthService.validateUser(
          mockRequest as Request,
          validEmail,
          validPassword,
          mockH as ResponseToolkit
        )
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle bcrypt comparison errors', async () => {
      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
      const bcryptError = new Error('Bcrypt error');
      (bcrypt.compare as jest.Mock).mockRejectedValue(bcryptError);

      await expect(
        AuthService.validateUser(
          mockRequest as Request,
          validEmail,
          validPassword,
          mockH as ResponseToolkit
        )
      ).rejects.toThrow('Bcrypt error');
    });

    it('should generate token even without JWT_SECRET in env', async () => {
      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (Jwt.token.generate as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await AuthService.validateUser(
        mockRequest as Request,
        validEmail,
        validPassword,
        mockH as ResponseToolkit
      );

      expect(Jwt.token.generate).toHaveBeenCalled();
      expect(result.token).toBe('mock-jwt-token');
    });
  });

  describe('validateToken', () => {
    const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
    const mockUserRow = {
      id: mockUserId,
      email: 'user@example.com',
      name: 'Test User',
      status: 'active',
      subscription_tier: 'free',
      subscription_expires_at: null,
      deleted_at: null,
      created_at: new Date('2024-01-01'),
      updated_at: new Date('2024-01-01'),
    };

    it('should validate token with decoded.decoded.payload format', async () => {
      const decoded = {
        decoded: {
          payload: { id: mockUserId, email: 'user@example.com' },
        },
      };

      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1::uuid'),
        [mockUserId]
      );
      expect(result).toEqual({
        isValid: true,
        credentials: {
          id: mockUserRow.id,
          email: mockUserRow.email,
          name: mockUserRow.name,
          status: mockUserRow.status,
          subscriptionTier: mockUserRow.subscription_tier,
          subscriptionExpiresAt: null,
          deletedAt: null,
          createdAt: mockUserRow.created_at,
          updatedAt: mockUserRow.updated_at,
        },
      });
    });

    it('should validate token with decoded.payload format', async () => {
      const decoded = {
        payload: { id: mockUserId, email: 'user@example.com' },
      };

      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result.isValid).toBe(true);
      expect(result.credentials?.id).toBe(mockUserId);
    });

    it('should validate token with direct payload format', async () => {
      const decoded = { id: mockUserId, email: 'user@example.com' };

      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result.isValid).toBe(true);
      expect(result.credentials?.id).toBe(mockUserId);
    });

    it('should return isValid false when decoded has no id', async () => {
      const decoded = {
        payload: { email: 'user@example.com' }, // missing id
      };

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result).toEqual({ isValid: false });
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should return isValid false when decoded is null', async () => {
      const result = await AuthService.validateToken(
        null,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result).toEqual({ isValid: false });
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should return isValid false when decoded is undefined', async () => {
      const result = await AuthService.validateToken(
        undefined,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result).toEqual({ isValid: false });
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should return isValid false when user not found in database', async () => {
      const decoded = { id: 'nonexistent-id', email: 'user@example.com' };
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result).toEqual({ isValid: false });
    });

    it('should exclude password_hash from query and returned credentials', async () => {
      const decoded = { id: mockUserId, email: 'user@example.com' };
      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.not.stringContaining('password_hash'),
        [mockUserId]
      );
      expect(result.credentials).not.toHaveProperty('passwordHash');
      expect(result.credentials).not.toHaveProperty('password_hash');
    });

    it('should handle user with null deleted_at', async () => {
      const decoded = { id: mockUserId, email: 'user@example.com' };
      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result.credentials?.deletedAt).toBeNull();
    });

    it('should propagate database errors', async () => {
      const decoded = { id: mockUserId, email: 'user@example.com' };
      const dbError = new Error('Database connection failed');
      mockDb.query.mockRejectedValue(dbError);

      await expect(
        AuthService.validateToken(
          decoded,
          mockRequest as Request,
          mockH as ResponseToolkit
        )
      ).rejects.toThrow('Database connection failed');
    });

    it('should return false for unsupported nested payload structures', async () => {
      const decoded = {
        decoded: {
          decoded: {
            payload: { id: mockUserId },
          },
        },
      };

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result.isValid).toBe(false);
      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should handle payload with extra fields', async () => {
      const decoded = {
        payload: {
          id: mockUserId,
          email: 'user@example.com',
          subscriptionTier: 'pro',
          extra: 'field',
          another: 'value',
        },
      };

      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });

      const result = await AuthService.validateToken(
        decoded,
        mockRequest as Request,
        mockH as ResponseToolkit
      );

      expect(result.isValid).toBe(true);
      expect(result.credentials?.id).toBe(mockUserId);
    });
  });

  describe('rowToUserSafe mapping', () => {
    it('should correctly map snake_case to camelCase', async () => {
      const mockUserRow = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'user@example.com',
        name: 'Test User',
        status: 'active',
        subscription_tier: 'pro',
        subscription_expires_at: new Date('2026-12-31'),
        deleted_at: new Date('2024-01-15'),
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-02'),
        password_hash: 'should-not-be-included',
      };

      mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (Jwt.token.generate as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await AuthService.validateUser(
        mockRequest as Request,
        'user@example.com',
        'password',
        mockH as ResponseToolkit
      );

      expect(result.credentials).toEqual({
        id: mockUserRow.id,
        email: mockUserRow.email,
        name: mockUserRow.name,
        status: mockUserRow.status,
        subscriptionTier: mockUserRow.subscription_tier,
        subscriptionExpiresAt: mockUserRow.subscription_expires_at,
        deletedAt: mockUserRow.deleted_at,
        createdAt: mockUserRow.created_at,
        updatedAt: mockUserRow.updated_at,
      });
    });
  });
});