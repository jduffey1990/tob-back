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
exports.tokenRoutes = void 0;
const tokenService_1 = require("../controllers/tokenService");
const email_service_1 = require("../controllers/email.service");
const userService_1 = require("../controllers/userService");
const emailService = new email_service_1.EmailService();
// ===== SEND ACTIVATION EMAIL ROUTE =====
exports.tokenRoutes = [
    {
        method: 'POST',
        path: '/send-activation/{email}',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { email } = request.params;
                // Validation
                if (!email) {
                    return h.response({ error: 'Missing email from params' }).code(400);
                }
                // Basic email validation
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    return h.response({ error: 'Invalid email address' }).code(400);
                }
                // Find user by email
                const userData = yield userService_1.UserService.findUserByEmail(email);
                if (!userData) {
                    return h.response({ error: 'User not found' }).code(404);
                }
                // Check if user is already activated
                if (userData.status === 'active') {
                    return h.response({
                        error: 'Account is already activated'
                    }).code(400);
                }
                // Check if there's already an active token (prevent spam)
                const hasActiveToken = yield tokenService_1.activationTokenService.hasActiveToken(userData.id);
                if (hasActiveToken) {
                    return h.response({
                        error: 'An activation email was already sent. Please check your inbox or wait before requesting another.'
                    }).code(429); // Too Many Requests
                }
                // Generate activation token
                const token = yield tokenService_1.activationTokenService.createActivationToken(userData.id, userData.email);
                // Send the activation email
                yield emailService.sendActivationEmail(userData.email, token);
                return h.response({
                    success: true,
                    message: 'Activation email sent successfully',
                }).code(200);
            }
            catch (error) {
                console.error('Send activation email error:', error);
                return h.response({
                    error: error.message || 'Failed to send activation email'
                }).code(500);
            }
        }),
        options: { auth: false },
    },
    // ===== ACTIVATE ACCOUNT ROUTE (POST) =====
    {
        method: 'POST',
        path: '/activate/{token}',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { token } = request.params;
                if (!token) {
                    return h.response({
                        error: 'Activation token is required'
                    }).code(400);
                }
                // Validate token
                const tokenData = yield tokenService_1.activationTokenService.validateToken(token);
                if (!tokenData) {
                    return h.response({
                        error: 'Invalid or expired activation token'
                    }).code(400);
                }
                yield userService_1.UserService.updateUser(tokenData.userId, { status: 'active' });
                // Mark token as used
                yield tokenService_1.activationTokenService.markTokenAsUsed(token);
                return h.response({
                    success: true,
                    message: 'Account activated successfully',
                    email: tokenData.email
                }).code(200);
            }
            catch (error) {
                console.error('Account activation error:', error);
                return h.response({
                    error: error.message || 'Failed to activate account'
                }).code(500);
            }
        }),
        options: { auth: false },
    },
    // ===== RESEND ACTIVATION EMAIL ROUTE =====
    {
        method: 'POST',
        path: '/resend-activation/{email}',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const { email } = request.params;
                if (!email) {
                    return h.response({ error: 'Missing email from params' }).code(400);
                }
                // Find user by email
                const userData = yield userService_1.UserService.findUserByEmail(email);
                if (!userData) {
                    // Don't reveal if user exists - security best practice
                    return h.response({
                        success: true,
                        message: 'If an account exists with this email, a new activation link has been sent.',
                    }).code(200);
                }
                // Check if already activated
                if (userData.status === 'active') {
                    return h.response({
                        error: 'Account is already activated'
                    }).code(400);
                }
                // Create new token (this will delete old ones)
                const token = yield tokenService_1.activationTokenService.resendActivationToken(userData.id, userData.email);
                // Send the activation email
                yield emailService.sendActivationEmail(userData.email, token);
                return h.response({
                    success: true,
                    message: 'A new activation email has been sent',
                }).code(200);
            }
            catch (error) {
                console.error('Resend activation email error:', error);
                return h.response({
                    error: error.message || 'Failed to resend activation email'
                }).code(500);
            }
        }),
        options: { auth: false },
    },
];
