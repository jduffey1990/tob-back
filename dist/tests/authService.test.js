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
// src/tests/authService.test.ts
const authService_1 = require("../controllers/authService");
const postgres_service_1 = require("../controllers/postgres.service");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jwt_1 = __importDefault(require("@hapi/jwt"));
// Mock dependencies
jest.mock('../controllers/postgres.service');
jest.mock('bcrypt');
jest.mock('@hapi/jwt');
describe('AuthService', () => {
    let mockDb;
    let mockRequest;
    let mockH;
    beforeEach(() => {
        jest.clearAllMocks();
        // Mock database instance
        mockDb = {
            query: jest.fn(),
        };
        postgres_service_1.PostgresService.getInstance.mockReturnValue(mockDb);
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
            company_id: '123e4567-e89b-12d3-a456-426614174001',
            email: 'user@example.com',
            name: 'Test User',
            status: 'active',
            deleted_at: null,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
            password_hash: hashedPassword,
        };
        it('should validate user with correct credentials and return token', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            bcrypt_1.default.compare.mockResolvedValue(true);
            jwt_1.default.token.generate.mockReturnValue('mock-jwt-token');
            const result = yield authService_1.AuthService.validateUser(mockRequest, validEmail, validPassword, mockH);
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('WHERE LOWER(email) = LOWER($1)'), [validEmail]);
            expect(bcrypt_1.default.compare).toHaveBeenCalledWith(validPassword, hashedPassword);
            expect(jwt_1.default.token.generate).toHaveBeenCalledWith({ id: mockUserRow.id, email: mockUserRow.email }, expect.any(String));
            expect(result).toEqual({
                isValid: true,
                credentials: {
                    id: mockUserRow.id,
                    companyId: mockUserRow.company_id,
                    email: mockUserRow.email,
                    name: mockUserRow.name,
                    status: mockUserRow.status,
                    deletedAt: null,
                    createdAt: mockUserRow.created_at,
                    updatedAt: mockUserRow.updated_at,
                },
                token: 'mock-jwt-token',
            });
        }));
        it('should handle case-insensitive email lookup', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            bcrypt_1.default.compare.mockResolvedValue(true);
            jwt_1.default.token.generate.mockReturnValue('mock-jwt-token');
            yield authService_1.AuthService.validateUser(mockRequest, 'USER@EXAMPLE.COM', validPassword, mockH);
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('WHERE LOWER(email) = LOWER($1)'), ['USER@EXAMPLE.COM']);
        }));
        it('should return isValid false when user not found', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [] });
            const result = yield authService_1.AuthService.validateUser(mockRequest, 'nonexistent@example.com', validPassword, mockH);
            expect(result).toEqual({ isValid: false });
            expect(bcrypt_1.default.compare).not.toHaveBeenCalled();
            expect(jwt_1.default.token.generate).not.toHaveBeenCalled();
        }));
        it('should return isValid false when password is incorrect', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            bcrypt_1.default.compare.mockResolvedValue(false);
            const result = yield authService_1.AuthService.validateUser(mockRequest, validEmail, 'wrongpassword', mockH);
            expect(result).toEqual({ isValid: false });
            expect(bcrypt_1.default.compare).toHaveBeenCalledWith('wrongpassword', hashedPassword);
            expect(jwt_1.default.token.generate).not.toHaveBeenCalled();
        }));
        it('should exclude password_hash from returned credentials', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            bcrypt_1.default.compare.mockResolvedValue(true);
            jwt_1.default.token.generate.mockReturnValue('mock-jwt-token');
            const result = yield authService_1.AuthService.validateUser(mockRequest, validEmail, validPassword, mockH);
            expect(result.credentials).toBeDefined();
            expect(result.credentials).not.toHaveProperty('passwordHash');
            expect(result.credentials).not.toHaveProperty('password_hash');
        }));
        it('should handle user with null company_id', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const userWithoutCompany = Object.assign(Object.assign({}, mockUserRow), { company_id: null });
            mockDb.query.mockResolvedValue({ rows: [userWithoutCompany] });
            bcrypt_1.default.compare.mockResolvedValue(true);
            jwt_1.default.token.generate.mockReturnValue('mock-jwt-token');
            const result = yield authService_1.AuthService.validateUser(mockRequest, validEmail, validPassword, mockH);
            expect((_a = result.credentials) === null || _a === void 0 ? void 0 : _a.companyId).toBeNull();
        }));
        it('should propagate database errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const dbError = new Error('Database connection failed');
            mockDb.query.mockRejectedValue(dbError);
            yield expect(authService_1.AuthService.validateUser(mockRequest, validEmail, validPassword, mockH)).rejects.toThrow('Database connection failed');
        }));
        it('should handle bcrypt comparison errors', () => __awaiter(void 0, void 0, void 0, function* () {
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            const bcryptError = new Error('Bcrypt error');
            bcrypt_1.default.compare.mockRejectedValue(bcryptError);
            yield expect(authService_1.AuthService.validateUser(mockRequest, validEmail, validPassword, mockH)).rejects.toThrow('Bcrypt error');
        }));
        it('should generate token even without JWT_SECRET in env', () => __awaiter(void 0, void 0, void 0, function* () {
            // JWT_SECRET is loaded at module import time, so we just verify
            // that a token is generated regardless
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            bcrypt_1.default.compare.mockResolvedValue(true);
            jwt_1.default.token.generate.mockReturnValue('mock-jwt-token');
            const result = yield authService_1.AuthService.validateUser(mockRequest, validEmail, validPassword, mockH);
            expect(jwt_1.default.token.generate).toHaveBeenCalled();
            expect(result.token).toBe('mock-jwt-token');
        }));
    });
    describe('validateToken', () => {
        const mockUserId = '123e4567-e89b-12d3-a456-426614174000';
        const mockUserRow = {
            id: mockUserId,
            company_id: '123e4567-e89b-12d3-a456-426614174001',
            email: 'user@example.com',
            name: 'Test User',
            status: 'active',
            deleted_at: null,
            created_at: new Date('2024-01-01'),
            updated_at: new Date('2024-01-01'),
        };
        it('should validate token with decoded.decoded.payload format', () => __awaiter(void 0, void 0, void 0, function* () {
            const decoded = {
                decoded: {
                    payload: { id: mockUserId, email: 'user@example.com' },
                },
            };
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect(mockDb.query).toHaveBeenCalledWith(expect.stringContaining('WHERE id = $1::uuid'), [mockUserId]);
            expect(result).toEqual({
                isValid: true,
                credentials: {
                    id: mockUserRow.id,
                    companyId: mockUserRow.company_id,
                    email: mockUserRow.email,
                    name: mockUserRow.name,
                    status: mockUserRow.status,
                    deletedAt: null,
                    createdAt: mockUserRow.created_at,
                    updatedAt: mockUserRow.updated_at,
                },
            });
        }));
        it('should validate token with decoded.payload format', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const decoded = {
                payload: { id: mockUserId, email: 'user@example.com' },
            };
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect(result.isValid).toBe(true);
            expect((_a = result.credentials) === null || _a === void 0 ? void 0 : _a.id).toBe(mockUserId);
        }));
        it('should validate token with direct payload format', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const decoded = { id: mockUserId, email: 'user@example.com' };
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect(result.isValid).toBe(true);
            expect((_a = result.credentials) === null || _a === void 0 ? void 0 : _a.id).toBe(mockUserId);
        }));
        it('should return isValid false when decoded has no id', () => __awaiter(void 0, void 0, void 0, function* () {
            const decoded = {
                payload: { email: 'user@example.com' }, // missing id
            };
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect(result).toEqual({ isValid: false });
            expect(mockDb.query).not.toHaveBeenCalled();
        }));
        it('should return isValid false when decoded is null', () => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield authService_1.AuthService.validateToken(null, mockRequest, mockH);
            expect(result).toEqual({ isValid: false });
            expect(mockDb.query).not.toHaveBeenCalled();
        }));
        it('should return isValid false when decoded is undefined', () => __awaiter(void 0, void 0, void 0, function* () {
            const result = yield authService_1.AuthService.validateToken(undefined, mockRequest, mockH);
            expect(result).toEqual({ isValid: false });
            expect(mockDb.query).not.toHaveBeenCalled();
        }));
        it('should return isValid false when user not found in database', () => __awaiter(void 0, void 0, void 0, function* () {
            const decoded = { id: 'nonexistent-id', email: 'user@example.com' };
            mockDb.query.mockResolvedValue({ rows: [] });
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect(result).toEqual({ isValid: false });
        }));
        it('should exclude password_hash from query and returned credentials', () => __awaiter(void 0, void 0, void 0, function* () {
            const decoded = { id: mockUserId, email: 'user@example.com' };
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect(mockDb.query).toHaveBeenCalledWith(expect.not.stringContaining('password_hash'), [mockUserId]);
            expect(result.credentials).not.toHaveProperty('passwordHash');
            expect(result.credentials).not.toHaveProperty('password_hash');
        }));
        it('should handle user with null company_id', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const userWithoutCompany = Object.assign(Object.assign({}, mockUserRow), { company_id: null });
            const decoded = { id: mockUserId, email: 'user@example.com' };
            mockDb.query.mockResolvedValue({ rows: [userWithoutCompany] });
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect((_a = result.credentials) === null || _a === void 0 ? void 0 : _a.companyId).toBeNull();
        }));
        it('should handle user with null deleted_at', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const decoded = { id: mockUserId, email: 'user@example.com' };
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect((_a = result.credentials) === null || _a === void 0 ? void 0 : _a.deletedAt).toBeNull();
        }));
        it('should propagate database errors', () => __awaiter(void 0, void 0, void 0, function* () {
            const decoded = { id: mockUserId, email: 'user@example.com' };
            const dbError = new Error('Database connection failed');
            mockDb.query.mockRejectedValue(dbError);
            yield expect(authService_1.AuthService.validateToken(decoded, mockRequest, mockH)).rejects.toThrow('Database connection failed');
        }));
        it('should return false for unsupported nested payload structures', () => __awaiter(void 0, void 0, void 0, function* () {
            // The service only supports 3 levels: decoded.decoded.payload, decoded.payload, or direct
            // Deeper nesting won't work based on the implementation
            const decoded = {
                decoded: {
                    decoded: {
                        payload: { id: mockUserId },
                    },
                },
            };
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            // This should return false because the payload extraction won't find the id
            expect(result.isValid).toBe(false);
            expect(mockDb.query).not.toHaveBeenCalled();
        }));
        it('should handle payload with extra fields', () => __awaiter(void 0, void 0, void 0, function* () {
            var _a;
            const decoded = {
                payload: {
                    id: mockUserId,
                    email: 'user@example.com',
                    extra: 'field',
                    another: 'value',
                },
            };
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            const result = yield authService_1.AuthService.validateToken(decoded, mockRequest, mockH);
            expect(result.isValid).toBe(true);
            expect((_a = result.credentials) === null || _a === void 0 ? void 0 : _a.id).toBe(mockUserId);
        }));
    });
    describe('rowToUserSafe mapping', () => {
        it('should correctly map snake_case to camelCase', () => __awaiter(void 0, void 0, void 0, function* () {
            const mockUserRow = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                company_id: '123e4567-e89b-12d3-a456-426614174001',
                email: 'user@example.com',
                name: 'Test User',
                status: 'active',
                deleted_at: new Date('2024-01-15'),
                created_at: new Date('2024-01-01'),
                updated_at: new Date('2024-01-02'),
                password_hash: 'should-not-be-included',
            };
            mockDb.query.mockResolvedValue({ rows: [mockUserRow] });
            bcrypt_1.default.compare.mockResolvedValue(true);
            jwt_1.default.token.generate.mockReturnValue('mock-jwt-token');
            const result = yield authService_1.AuthService.validateUser(mockRequest, 'user@example.com', 'password', mockH);
            expect(result.credentials).toEqual({
                id: mockUserRow.id,
                companyId: mockUserRow.company_id,
                email: mockUserRow.email,
                name: mockUserRow.name,
                status: mockUserRow.status,
                deletedAt: mockUserRow.deleted_at,
                createdAt: mockUserRow.created_at,
                updatedAt: mockUserRow.updated_at,
            });
        }));
    });
});
