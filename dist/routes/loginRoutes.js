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
exports.loginRoutes = exports.homeRoutes = void 0;
const joi_1 = __importDefault(require("joi"));
const authService_1 = require("../controllers/authService");
exports.homeRoutes = [
    {
        method: 'GET',
        path: '/',
        handler: (request, h) => {
            return 'Welcome to the restricted home page!';
        },
        options: { auth: 'jwt' } // Allow unauthenticated access for login
    }
];
exports.loginRoutes = [
    {
        method: 'POST',
        path: '/login',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log('🔵 Login request received:', request.payload);
                // Change username to email:
                const { email, password } = request.payload;
                const { isValid, credentials: user, token } = yield authService_1.AuthService.validateUser(request, email, password, h);
                if (!isValid) {
                    console.log('❌ Invalid credentials for:', email);
                    return h.response({ message: "Invalid credentials" }).code(401);
                }
                // user must activate account through email verification first
                if (user && user.status !== 'active') {
                    console.log('❌ User inactive', email);
                    return h.response({
                        error: 'USER_INACTIVE',
                        message: 'Please verify your email to activate your account.',
                    }).code(403);
                }
                if (user) {
                    console.log('✅ Login successful:', email);
                    return h.response({ token, user: user }).code(200);
                }
                console.log('❌ No user found:', email);
                return h.response({ message: 'No user found' }).code(404);
            }
            catch (error) {
                console.error('❌❌❌ LOGIN ERROR:', error);
                throw error;
            }
        }),
        options: {
            auth: false,
            validate: {
                payload: joi_1.default.object({
                    email: joi_1.default.string().email().required(),
                    password: joi_1.default.string().required(),
                }),
                failAction: (request, h, err) => __awaiter(void 0, void 0, void 0, function* () { throw err; }),
            },
        },
    },
];
