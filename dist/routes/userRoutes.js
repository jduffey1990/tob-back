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
const bcrypt_1 = __importDefault(require("bcrypt"));
const userService_1 = require("../controllers/userService");
// Initialize Stripe (if needed at some point)
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
//   apiVersion: '2025-02-24.acacia', // if this blows up, omit apiVersion to use pkg default
// });
exports.userRoutes = [
    // find all them hoes
    // { 
    //   method: 'GET', 
    //   path: '/users', 
    //   handler: (request: Request, h: ResponseToolkit) => { 
    //     return UserService.findAllUsers() 
    //   }, 
    //   options: { auth: false  } 
    // },
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
        options: { auth: false },
    },
    // Update the authenticated user's name/email
    {
        method: 'PATCH',
        path: '/edit-user',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                // Your JWT validate step returns credentials = UserSafe
                const authUser = request.auth.credentials;
                if (!(authUser === null || authUser === void 0 ? void 0 : authUser.id))
                    return h.response({ error: 'Unauthorized' }).code(401);
                const account = request.payload;
                const updatedUser = yield userService_1.UserService.userUpdateInfo(authUser.id, account);
                return h.response(updatedUser).code(200);
            }
            catch (error) {
                return h.response({ error: error.message }).code(500);
            }
        }),
        options: { auth: false },
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
        options: { auth: false },
    },
    // Return the current session's user (already validated by @hapi/jwt)
    {
        method: 'GET',
        path: '/session',
        handler: (request) => __awaiter(void 0, void 0, void 0, function* () {
            const user = request.auth.credentials;
            return { user };
        }),
        options: { auth: false },
    },
    // Create a new user (public signup)
    {
        method: 'POST',
        path: '/create-user',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            var _a, _b, _c, _d, _e;
            try {
                const payload = request.payload;
                const name = ((_a = payload.name) === null || _a === void 0 ? void 0 : _a.toString().trim()) ||
                    `${(_b = payload.firstName) !== null && _b !== void 0 ? _b : ''} ${(_c = payload.lastName) !== null && _c !== void 0 ? _c : ''}`.trim();
                if (!payload.email || !payload.password || !name) {
                    return h
                        .response({ error: 'email, password, and name are required' })
                        .code(400);
                }
                const passwordHash = yield bcrypt_1.default.hash(payload.password, 10);
                // If you capture companyId/status at signup, pass them here
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
                // Preserve your existing FE message for unique violations
                if ((_e = error === null || error === void 0 ? void 0 : error.message) === null || _e === void 0 ? void 0 : _e.includes('duplicate key value violates unique constraint')) {
                    return h
                        .response({ error: 'duplicate key value violates unique constraint' })
                        .code(400);
                }
                return h.response({ error: error.message }).code(500);
            }
        }),
        options: { auth: false },
    },
];
