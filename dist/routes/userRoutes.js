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
const axios_1 = __importDefault(require("axios"));
const bcrypt_1 = __importDefault(require("bcrypt"));
const userService_1 = require("../controllers/userService");
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
            if (!id)
                return h.response('User ID is required').code(400);
            // Optional: basic UUID sanity check
            if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
                return h.response('Invalid user id format').code(400);
            }
            const user = yield userService_1.UserService.findUserById(id);
            if (!user)
                return h.response({ error: 'User not found' }).code(404);
            return h.response(user).code(200);
        }),
        options: { auth: 'jwt' },
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
                // If firstName/lastName provided, convert to name
                const updates = Object.assign({}, payload);
                if (payload.firstName || payload.lastName) {
                    const firstName = payload.firstName || authUser.name.split(' ')[0] || '';
                    const lastName = payload.lastName || authUser.name.split(' ').slice(1).join(' ') || '';
                    updates.name = `${firstName} ${lastName}`.trim();
                    delete updates.firstName;
                    delete updates.lastName;
                }
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
            const startTime = Date.now();
            try {
                const payload = request.payload;
                const captchaStart = Date.now();
                yield verifyCaptcha(payload.captchaToken, 0.5);
                // ... validation ...
                const name = ((_a = payload.name) === null || _a === void 0 ? void 0 : _a.toString().trim()) ||
                    `${(_b = payload.firstName) !== null && _b !== void 0 ? _b : ''} ${(_c = payload.lastName) !== null && _c !== void 0 ? _c : ''}`.trim();
                if (!payload.email || !payload.password || !name) {
                    return h
                        .response({ error: 'email, password, and name are required' })
                        .code(400);
                }
                const hashStart = Date.now();
                const passwordHash = yield bcrypt_1.default.hash(payload.password, 8);
                const dbStart = Date.now();
                const newUser = yield userService_1.UserService.createUser({
                    email: payload.email.toLowerCase(),
                    name,
                    passwordHash,
                    companyId: (_d = payload.companyId) !== null && _d !== void 0 ? _d : null,
                    status: "inactive"
                });
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
            auth: false, // Or require admin auth
            tags: ['api', 'users', 'dangerous'],
            description: '⚠️ DEV ONLY: Permanently delete user'
        },
    },
];
