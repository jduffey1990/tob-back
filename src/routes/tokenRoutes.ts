// Updated route handlers using the activation token service
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { activationTokenService } from '../controllers/tokenService';
import { EmailService } from '../controllers/email.service';
import { UserService } from '../controllers/userService';

const emailService = new EmailService();

// ===== SEND ACTIVATION EMAIL ROUTE =====
export const tokenRoutes: ServerRoute[] = [
    {
        method: 'POST',
        path: '/send-activation/{email}',
        handler: async (request: Request, h: ResponseToolkit) => {
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
                const userData = await UserService.findUserByEmail(email);

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
                const hasActiveToken = await activationTokenService.hasActiveToken(userData.id);
                if (hasActiveToken) {
                    return h.response({ 
                        error: 'An activation email was already sent. Please check your inbox or wait before requesting another.' 
                    }).code(429); // Too Many Requests
                }

                // Generate activation token
                const token = await activationTokenService.createActivationToken(
                    userData.id,
                    userData.email
                );

                // Send the activation email
                await emailService.sendActivationEmail(userData.email, token);

                return h.response({
                    success: true,
                    message: 'Activation email sent successfully',
                }).code(200);
            } catch (error: any) {
                console.error('Send activation email error:', error);
                return h.response({ 
                    error: error.message || 'Failed to send activation email' 
                }).code(500);
            }
        },
        options: { auth: false },
    },

    // ===== ACTIVATE ACCOUNT ROUTE (POST) =====
    {
        method: 'POST',
        path: '/activate/{token}',
        handler: async (request: Request, h: ResponseToolkit) => {
            try {
                const { token } = request.params;

                if (!token) {
                    return h.response({ 
                        error: 'Activation token is required' 
                    }).code(400);
                }

                // Validate token
                const tokenData = await activationTokenService.validateToken(token);

                if (!tokenData) {
                    return h.response({ 
                        error: 'Invalid or expired activation token' 
                    }).code(400);
                }

                await UserService.updateUser(tokenData.userId, { status: 'active' });

                // Mark token as used
                await activationTokenService.markTokenAsUsed(token);

                return h.response({
                    success: true,
                    message: 'Account activated successfully',
                    email: tokenData.email
                }).code(200);

            } catch (error: any) {
                console.error('Account activation error:', error);
                return h.response({ 
                    error: error.message || 'Failed to activate account' 
                }).code(500);
            }
        },
        options: { auth: false },
    },

    // ===== RESEND ACTIVATION EMAIL ROUTE =====
    {
        method: 'POST',
        path: '/resend-activation/{email}',
        handler: async (request: Request, h: ResponseToolkit) => {
            try {
                const { email } = request.params;

                if (!email) {
                    return h.response({ error: 'Missing email from params' }).code(400);
                }

                // Find user by email
                const userData = await UserService.findUserByEmail(email);

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
                const token = await activationTokenService.resendActivationToken(
                    userData.id,
                    userData.email
                );

                // Send the activation email
                await emailService.sendActivationEmail(userData.email, token);

                return h.response({
                    success: true,
                    message: 'A new activation email has been sent',
                }).code(200);
            } catch (error: any) {
                console.error('Resend activation email error:', error);
                return h.response({ 
                    error: error.message || 'Failed to resend activation email' 
                }).code(500);
            }
        },
        options: { auth: false },
    },
];