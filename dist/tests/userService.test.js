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
// src/tests/userService.test.ts
const userService_1 = require("../controllers/userService");
const postgres_service_1 = require("../controllers/postgres.service");
// Mock the PostgresService
jest.mock('../controllers/postgres.service');
describe('UserService', () => {
    let mockDb;
    beforeEach(() => {
        // Reset mocks before each test
        jest.clearAllMocks();
        // Create mock database instance
        mockDb = {
            query: jest.fn(),
            runInTransaction: jest.fn(),
        };
        // Mock getInstance to return our mock db
        postgres_service_1.PostgresService.getInstance.mockReturnValue(mockDb);
    });
    describe('findAllUsers', () => {
        it('should return all users ordered by created_at DESC', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRows = [
                {
                    id: '123e4567-e89b-12d3-a456-426614174000',
                    email: 'user1@example.com',
                    name: 'User One',
                    status: 'active',
                    subscription_tier: 'free',
                    subscription_expires_at: null,
                    deleted_at: null,
                    created_at: new Date('2024-01-01'),
                    updated_at: new Date('2024-01-01'),
                },
                {
                    id: '123e4567-e89b-12d3-a456-426614174002',
                    email: 'user2@example.com',
                    name: 'User Two',
                    status: 'inactive',
                    subscription_tier: 'pro',
                    subscription_expires_at: new Date('2026-12-31'),
                    deleted_at: null,
                    created_at: new Date('2024-01-02'),
                    updated_at: new Date('2024-01-02'),
                },
            ];
            mockDb.query.mockResolvedValue({ rows: mockRows });
            const result = yield userService_1.UserService.findAllUsers();
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('SELECT id, email, name, status, subscription_tier, subscription_expires_at'));
            expect(result).toHaveLength(2);
            expect(result[0]).toEqual({
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user1@example.com',
                name: 'User One',
                status: 'active',
                subscriptionTier: 'free',
                subscriptionExpiresAt: null,
                deletedAt: null,
                createdAt: mockRows[0].created_at,
                updatedAt: mockRows[0].updated_at,
            });
            expect(result[1].subscriptionTier).toBe('pro');
            expect(result[1].subscriptionExpiresAt).toEqual(new Date('2026-12-31'));
        }));
        it('should return empty array when no users exist', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [] });
            const result = yield userService_1.UserService.findAllUsers();
            expect(result).toEqual([]);
        }));
    });
    describe('findUserById', () => {
        it('should return a user when found', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'Test User',
                status: 'active',
                subscription_tier: 'lifetime',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-01'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.findUserById('123e4567-e89b-12d3-a456-426614174000');
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1::uuid'), ['123e4567-e89b-12d3-a456-426614174000']);
            expect(result).toEqual({
                id: mockRow.id,
                email: mockRow.email,
                name: mockRow.name,
                status: mockRow.status,
                subscriptionTier: 'lifetime',
                subscriptionExpiresAt: null,
                deletedAt: null,
                createdAt: mockRow.created_at,
                updatedAt: mockRow.updated_at,
            });
        }));
        it('should return null when user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [] });
            const result = yield userService_1.UserService.findUserById('nonexistent-id');
            expect(result).toBeNull();
        }));
    });
    describe('createUser', () => {
        it('should create a user with all fields', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'newuser@example.com',
                name: 'New User',
                status: 'active',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-01'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.createUser({
                email: 'newuser@example.com',
                name: 'New User',
                passwordHash: 'hashed_password_123',
                status: 'active',
            });
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), ['newuser@example.com', 'hashed_password_123', 'New User', 'active']);
            expect(result.email).toBe('newuser@example.com');
            expect(result.name).toBe('New User');
            expect(result.subscriptionTier).toBe('free');
        }));
        it('should create a user with default status when not provided', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'newuser@example.com',
                name: 'New User',
                status: 'active',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-01'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.createUser({
                email: 'newuser@example.com',
                name: 'New User',
                passwordHash: 'hashed_password_123',
            });
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO users'), ['newuser@example.com', 'hashed_password_123', 'New User', 'active']);
            expect(result.status).toBe('active');
            expect(result.subscriptionTier).toBe('free'); // DB default
        }));
        it('should throw error when email already exists (duplicate key)', () => __awaiter(void 0, void 0, void 0, function* () {
            const duplicateError = new Error('duplicate key error');
            duplicateError.code = '23505';
            mockDb.query.mockRejectedValue(duplicateError);
            yield expect(userService_1.UserService.createUser({
                email: 'duplicate@example.com',
                name: 'Duplicate User',
                passwordHash: 'hashed_password_123',
            })).rejects.toThrow('duplicate key value violates unique constraint');
        }));
        it('should rethrow other database errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const otherError = new Error('Database connection failed');
            mockDb.query.mockRejectedValue(otherError);
            yield expect(userService_1.UserService.createUser({
                email: 'user@example.com',
                name: 'User',
                passwordHash: 'hashed_password_123',
            })).rejects.toThrow('Database connection failed');
        }));
    });
    describe('updateUser', () => {
        it('should update user name and email', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'updated@example.com',
                name: 'John Doe',
                status: 'active',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.updateUser('123e4567-e89b-12d3-a456-426614174000', {
                name: 'John Doe',
                email: 'updated@example.com',
            });
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), ['John Doe', 'updated@example.com', '123e4567-e89b-12d3-a456-426614174000']);
            expect(result.name).toBe('John Doe');
            expect(result.email).toBe('updated@example.com');
        }));
        it('should update subscription tier and expiration', () => __awaiter(void 0, void 0, void 0, function* () {
            const expiresAt = new Date('2026-12-31');
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'Test User',
                status: 'active',
                subscription_tier: 'pro',
                subscription_expires_at: expiresAt,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.updateUser('123e4567-e89b-12d3-a456-426614174000', {
                subscriptionTier: 'pro',
                subscriptionExpiresAt: expiresAt,
            });
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), ['pro', expiresAt, '123e4567-e89b-12d3-a456-426614174000']);
            expect(result.subscriptionTier).toBe('pro');
            expect(result.subscriptionExpiresAt).toEqual(expiresAt);
        }));
        it('should handle single name correctly', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'Madonna',
                status: 'active',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.updateUser('123e4567-e89b-12d3-a456-426614174000', {
                name: 'Madonna',
                email: 'user@example.com',
            });
            expect(mockDb.query).toHaveBeenCalledWith(expect.anything(), ['Madonna', 'user@example.com', '123e4567-e89b-12d3-a456-426614174000']);
            expect(result.name).toBe('Madonna');
        }));
        it('should throw error when user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [] });
            yield expect(userService_1.UserService.updateUser('nonexistent-id', {
                name: 'John Doe',
                email: 'user@example.com',
            })).rejects.toThrow('User not found');
        }));
        it('should update only provided fields', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'John Doe',
                status: 'inactive',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.updateUser('123e4567-e89b-12d3-a456-426614174000', {
                status: 'inactive',
            });
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), ['inactive', '123e4567-e89b-12d3-a456-426614174000']);
            expect(result.status).toBe('inactive');
        }));
        it('should throw error when no fields to update', () => __awaiter(void 0, void 0, void 0, function* () {
            yield expect(userService_1.UserService.updateUser('123e4567-e89b-12d3-a456-426614174000', {})).rejects.toThrow('No fields to update');
        }));
    });
    describe('activateUser', () => {
        it('should activate an inactive user', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'Test User',
                status: 'active',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.activateUser('123e4567-e89b-12d3-a456-426614174000');
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("SET status = 'active'"), ['123e4567-e89b-12d3-a456-426614174000']);
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining("AND status = 'inactive'"), expect.anything());
            expect(result.status).toBe('active');
        }));
        it('should throw error when user not found or already active', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [] });
            yield expect(userService_1.UserService.activateUser('123e4567-e89b-12d3-a456-426614174000')).rejects.toThrow('Activation failed: user not found or already active');
        }));
    });
    describe('softDelete', () => {
        it('should soft delete a user by setting deleted_at', () => __awaiter(void 0, void 0, void 0, function* () {
            const now = new Date();
            const mockRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'Test User',
                status: 'active',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: now,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
            };
            mockDb.query.mockResolvedValue({ rows: [mockRow] });
            const result = yield userService_1.UserService.softDelete('123e4567-e89b-12d3-a456-426614174000');
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('SET deleted_at = NOW()'), ['123e4567-e89b-12d3-a456-426614174000']);
            expect(result.deletedAt).toEqual(now);
        }));
        it('should throw error when user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [] });
            yield expect(userService_1.UserService.softDelete('nonexistent-id')).rejects.toThrow('User not found');
        }));
    });
    describe('hardDelete', () => {
        it('should permanently delete a user', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rowCount: 1 });
            yield userService_1.UserService.hardDelete('123e4567-e89b-12d3-a456-426614174000');
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM users'), ['123e4567-e89b-12d3-a456-426614174000']);
        }));
        it('should throw error when user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rowCount: 0 });
            yield expect(userService_1.UserService.hardDelete('nonexistent-id')).rejects.toThrow('User not found');
        }));
    });
    describe('markUserPaidFromIntent', () => {
        it('should mark user as paid and insert payment record in transaction', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockUserRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'Test User',
                status: 'active',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
            };
            const mockTx = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [] }) // First call: INSERT payment
                    .mockResolvedValueOnce({ rows: [mockUserRow] }), // Second call: UPDATE user
            };
            mockDb.runInTransaction.mockImplementation((callback) => __awaiter(void 0, void 0, void 0, function* () {
                return callback(mockTx);
            }));
            const result = yield userService_1.UserService.markUserPaidFromIntent('123e4567-e89b-12d3-a456-426614174000', 'pi_1234567890');
            expect(mockDb.runInTransaction).toHaveBeenCalled();
            expect(mockTx.query).toHaveBeenCalledTimes(2);
            expect(mockTx.query).toHaveBeenNthCalledWith(1, expect.stringContaining('INSERT INTO payments'), expect.arrayContaining(['123e4567-e89b-12d3-a456-426614174000', 'pi_1234567890']));
            expect(mockTx.query).toHaveBeenNthCalledWith(2, expect.stringContaining('UPDATE users'), ['123e4567-e89b-12d3-a456-426614174000']);
            expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
        }));
        it('should handle idempotent payment insertion (ON CONFLICT DO NOTHING)', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockUserRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                email: 'user@example.com',
                name: 'Test User',
                status: 'active',
                subscription_tier: 'free',
                subscription_expires_at: null,
                deleted_at: null,
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
            };
            const mockTx = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [] }) // INSERT with conflict (no rows returned)
                    .mockResolvedValueOnce({ rows: [mockUserRow] }), // UPDATE user
            };
            mockDb.runInTransaction.mockImplementation((callback) => __awaiter(void 0, void 0, void 0, function* () {
                return callback(mockTx);
            }));
            const result = yield userService_1.UserService.markUserPaidFromIntent('123e4567-e89b-12d3-a456-426614174000', 'pi_1234567890');
            expect(result.id).toBe('123e4567-e89b-12d3-a456-426614174000');
        }));
        it('should throw error when user not found in transaction', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockTx = {
                query: jest.fn()
                    .mockResolvedValueOnce({ rows: [] }) // INSERT payment
                    .mockResolvedValueOnce({ rows: [] }), // UPDATE user (not found)
            };
            mockDb.runInTransaction.mockImplementation((callback) => __awaiter(void 0, void 0, void 0, function* () {
                return callback(mockTx);
            }));
            yield expect(userService_1.UserService.markUserPaidFromIntent('nonexistent-id', 'pi_1234567890')).rejects.toThrow('User not found');
        }));
        it('should rollback transaction on error', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockTx = {
                query: jest.fn().mockRejectedValue(new Error('Database error')),
            };
            mockDb.runInTransaction.mockImplementation((callback) => __awaiter(void 0, void 0, void 0, function* () {
                return callback(mockTx);
            }));
            yield expect(userService_1.UserService.markUserPaidFromIntent('123e4567-e89b-12d3-a456-426614174000', 'pi_1234567890')).rejects.toThrow('Database error');
        }));
    });
});
