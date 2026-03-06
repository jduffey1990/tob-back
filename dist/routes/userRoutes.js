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
exports.userRoutes = void 0;
const joi_1 = __importDefault(require("joi"));
const axios_1 = __importDefault(require("axios"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const email_service_1 = require("../controllers/email.service");
const userService_1 = require("../controllers/userService");
const tokenService_1 = require("../controllers/tokenService");
function verifyCaptcha(token_1) {
    return __awaiter(this, arguments, void 0, function* (token, minScore = 0.5) {
        if (!token) {
            console.warn('No CAPTCHA token provided');
            // During development, you can allow this
            return { success: true, score: null };
        }
        const secretKey = process.env.RECAPTCHA_SECRET_KEY;
        if (!secretKey) {
            console.warn('RECAPTCHA_SECRET_KEY not set - skipping verification');
            return { success: true, score: null };
        }
        try {
            const response = yield axios_1.default.post('https://www.google.com/recaptcha/api/siteverify', null, {
                params: {
                    secret: secretKey,
                    response: token,
                },
            });
            const { success, score, action } = response.data;
            if (!success) {
                throw new Error('CAPTCHA verification failed');
            }
            if (score < minScore) {
                throw new Error(`CAPTCHA score too low: ${score}`);
            }
            return { success: true, score };
        }
        catch (error) {
            console.error('CAPTCHA verification error:', error.message);
            throw error;
        }
    });
}
exports.userRoutes = [
    // find all them hoes
    {
        method: 'GET',
        path: '/users',
        handler: (request, h) => {
            return userService_1.UserService.findAllUsers();
        },
        options: { auth: false }
    },
    // Simple health check
    {
        method: 'GET',
        path: '/ping-user',
        handler: (_request, h) => {
            return h.response('pinged backend').code(200);
        },
        options: { auth: false },
    },
    // Get a single user by id (UUID) - requires auth by default;
    {
        method: 'GET',
        path: '/get-user',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            const id = request.query.id;
            const user = yield userService_1.UserService.findUserById(id);
            if (!user)
                return h.response({ error: 'User not found' }).code(404);
            return h.response(user).code(200);
        }),
        options: {
            auth: 'jwt',
            validate: {
                query: joi_1.default.object({
                    id: joi_1.default.string().uuid().required(),
                }),
                failAction: (request, h, err) => __awaiter(void 0, void 0, void 0, function* () { throw err; }),
            },
        },
    },
    // Update the authenticated user's name/email
    {
        method: 'PATCH',
        path: '/edit-user',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const authUser = request.auth.credentials;
                if (!(authUser === null || authUser === void 0 ? void 0 : authUser.id))
                    return h.response({ error: 'Unauthorized' }).code(401);
                const payload = request.payload;
                // Build updates object
                const updates = Object.assign({}, payload);
                // If firstName/lastName provided, convert to name
                if (payload.firstName || payload.lastName) {
                    const firstName = payload.firstName || authUser.name.split(' ')[0] || '';
                    const lastName = payload.lastName || authUser.name.split(' ').slice(1).join(' ') || '';
                    updates.name = `${firstName} ${lastName}`.trim();
                    delete updates.firstName;
                    delete updates.lastName;
                }
                // Call the dynamic updateUser service
                // It will only update fields that are present in the updates object
                const updatedUser = yield userService_1.UserService.updateUser(authUser.id, updates);
                return h.response(updatedUser).code(200);
            }
            catch (error) {
                return h.response({ error: error.message }).code(500);
            }
        }),
        options: { auth: 'jwt' },
    },
    // Update the authenticated user's name/email
    {
        method: 'PATCH',
        path: '/activate-user',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // Your JWT validate step returns credentials = UserSafe
                const authUser = request.auth.credentials;
                if (!(authUser === null || authUser === void 0 ? void 0 : authUser.id))
                    return h.response({ error: 'Unauthorized' }).code(401);
                const updatedUser = yield userService_1.UserService.activateUser(authUser.id);
                return h.response(updatedUser).code(200);
            }
            catch (error) {
                return h.response({ error: error.message }).code(500);
            }
        }),
        options: { auth: 'jwt' },
    },
    // Return the current session's user (already validated by @hapi/jwt)
    {
        method: 'GET',
        path: '/session',
        handler: (request) => __awaiter(void 0, void 0, void 0, function* () {
            const user = request.auth.credentials;
            return { user };
        }),
        options: { auth: 'jwt' },
    },
    // Create a new user (public signup)
    {
        method: 'POST',
        path: '/create-user',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            try {
                const payload = request.payload;
                // Parse name from either 'name' field or 'firstName' + 'lastName'
                const name = ((_a = payload.name) === null || _a === void 0 ? void 0 : _a.toString().trim()) ||
                    `${(_b = payload.firstName) !== null && _b !== void 0 ? _b : ''} ${(_c = payload.lastName) !== null && _c !== void 0 ? _c : ''}`.trim();
                // Hash password (8 rounds is fine for bcrypt)
                const passwordHash = yield bcrypt_1.default.hash(payload.password, 8);
                const denomination = ((_d = payload.denomination) === null || _d === void 0 ? void 0 : _d.toString().trim()) || 'Christian';
                // Create user
                // Note: subscriptionTier defaults to 'free' in DB
                //       subscriptionExpiresAt defaults to NULL
                //       status set to 'inactive' (requires email verification)
                const newUser = yield userService_1.UserService.createUser({
                    email: payload.email.toLowerCase(),
                    name,
                    passwordHash,
                    status: "inactive",
                    denomination
                });
                // Create activation token
                const activationToken = yield tokenService_1.activationTokenService.createActivationToken(newUser.id, newUser.email);
                // Send activation email
                const emailService = new email_service_1.EmailService();
                yield emailService.sendActivationEmail(newUser.email, activationToken);
                return h.response(newUser).code(201);
            }
            catch (error) {
                console.error('Create user error:', error);
                // Handle duplicate email
                if ((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('duplicate key')) {
                    return h.response({
                        error: 'An account with this email already exists'
                    }).code(409);
                }
                // Handle other errors
                return h.response({
                    error: error.message || 'Failed to create account'
                }).code(500);
            }
        }),
        options: {
            auth: false,
            validate: {
                payload: joi_1.default.object({
                    email: joi_1.default.string().email().required(),
                    password: joi_1.default.string().required(),
                    name: joi_1.default.string().optional().trim(),
                    firstName: joi_1.default.string().optional().trim(),
                    lastName: joi_1.default.string().optional().trim(),
                    denomination: joi_1.default.string().optional().trim(),
                }).or('name', 'firstName'),
                failAction: (request, h, err) => __awaiter(void 0, void 0, void 0, function* () { throw err; }),
            },
        },
    },
    // Return the current session's user (already validated by @hapi/jwt)
    {
        method: 'DELETE',
        path: '/hard-delete/{userId}',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { userId } = request.params;
                // ⚠️ SAFETY CHECK: Only allow in development
                if (process.env.NODE_ENV === 'production') {
                    return h.response({ error: 'Hard delete not allowed in production' }).code(403);
                }
                // Optional: Require a special header for extra safety
                const dangerousHeader = request.headers['x-allow-hard-delete'];
                if (dangerousHeader !== 'yes-i-know-this-is-permanent') {
                    return h.response({
                        error: 'Missing required header: x-allow-hard-delete'
                    }).code(400);
                }
                yield userService_1.UserService.hardDelete(userId);
                return h.response({
                    success: true,
                    message: 'User permanently deleted'
                }).code(200);
            }
            catch (error) {
                return h.response({ error: error.message }).code(500);
            }
        }),
        options: {
            auth: false,
            validate: {
                params: joi_1.default.object({
                    userId: joi_1.default.string().uuid().required(),
                }),
                failAction: (request, h, err) => __awaiter(void 0, void 0, void 0, function* () { throw err; }),
            },
            tags: ['api', 'users', 'dangerous'],
            description: '⚠️ DEV ONLY: Permanently delete user'
        },
    },
    // PATCH /users/me/settings - Update authenticated user's settings
    {
        method: 'PATCH',
        path: '/users/me/settings',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const authUser = request.auth.credentials;
                if (!(authUser === null || authUser === void 0 ? void 0 : authUser.id)) {
                    return h.response({ error: 'Unauthorized' }).code(401);
                }
                const payload = request.payload;
                const updatedUser = yield userService_1.UserService.updateSettings(authUser.id, payload);
                return h.response(updatedUser).code(200);
            }
            catch (err) {
                console.error('Error updating settings:', err);
                return h.response({ error: err.message || 'Failed to update settings' }).code(400);
            }
        }),
        options: {
            auth: 'jwt',
            validate: {
                payload: joi_1.default.object({
                    voiceIndex: joi_1.default.number().integer().min(0).max(8).optional(),
                    playbackRate: joi_1.default.number().min(0).max(1).optional(),
                }),
                failAction: (request, h, err) => __awaiter(void 0, void 0, void 0, function* () { throw err; }),
            },
        },
    },
    // GET /users/me/settings - Get authenticated user's settings
    {
        method: 'GET',
        path: '/users/me/settings',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const authUser = request.auth.credentials;
                if (!(authUser === null || authUser === void 0 ? void 0 : authUser.id)) {
                    return h.response({ error: 'Unauthorized' }).code(401);
                }
                const user = yield userService_1.UserService.findUserById(authUser.id);
                if (!user) {
                    return h.response({ error: 'User not found' }).code(404);
                }
                return h.response(user.settings).code(200);
            }
            catch (err) {
                console.error('Error fetching settings:', err);
                return h.response({ error: 'Failed to fetch settings' }).code(500);
            }
        }),
        options: { auth: 'jwt' },
    },
    {
        method: 'POST',
        path: '/cleanup/deleted-users',
        options: {
            auth: false, // EventBridge doesn't use JWT
            description: 'Cleanup deleted users (called by EventBridge)',
            tags: ['api', 'cleanup']
        },
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // Optional: Add API key validation for security
                const apiKey = request.headers['x-api-key'];
                if (apiKey !== process.env.CLEANUP_API_KEY) {
                    return h.response({ error: 'Unauthorized' }).code(401);
                }
                const result = yield userService_1.UserService.cleanupOldDeletedUsers();
                return h.response({
                    success: true,
                    message: `Deleted ${result.deletedCount} users`,
                    deletedCount: result.deletedCount
                }).code(200);
            }
            catch (error) {
                console.error('Cleanup endpoint error:', error);
                return h.response({
                    error: error.message || 'Cleanup failed'
                }).code(500);
            }
        })
    }
];
