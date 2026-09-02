// Updated route handlers using the activation token service
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { activationTokenService } from '../controllers/tokenService';
import { EmailService } from '../controllers/email.service';
import { UserService } from '../controllers/userService';

const emailService = new EmailService();

// One response for every outcome that depends on account state: unknown email,
// already active, token already outstanding, mail actually sent. Anything that
// distinguishes them is an oracle -- an unauthenticated caller could walk a list
// and learn which addresses have accounts and whether they are activated.
// Malformed input still 400s, since that reveals nothing about the database.
const ACTIVATION_ACCEPTED = {
    success: true,
    message: 'If an account exists with this email and still needs activation, an activation link has been sent.',
};


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
                    return h.response(ACTIVATION_ACCEPTED).code(200);
                }

                // Already activated -- nothing to send, but say so indistinguishably.
                if (userData.status === 'active') {
                    return h.response(ACTIVATION_ACCEPTED).code(200);
                }

                // A token is already outstanding. This is the guard that bounds
                // mail volume per account; the rate limiter bounds it per IP.
                const hasActiveToken = await activationTokenService.hasActiveToken(userData.id);
                if (hasActiveToken) {
                    return h.response(ACTIVATION_ACCEPTED).code(200);
                }

                // Generate activation token
                const token = await activationTokenService.createActivationToken(
                    userData.id,
                    userData.email
                );

                // Send the activation email
                await emailService.sendActivationEmail(userData.email, token);

                return h.response(ACTIVATION_ACCEPTED).code(200);
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
                    return h.response(ACTIVATION_ACCEPTED).code(200);
                }

                // Already activated -- the 400 that used to live here told an
                // unauthenticated caller the address was real.
                if (userData.status === 'active') {
                    return h.response(ACTIVATION_ACCEPTED).code(200);
                }

                // Create new token (this will delete old ones)
                const token = await activationTokenService.resendActivationToken(
                    userData.id,
                    userData.email
                );

                // Send the activation email
                await emailService.sendActivationEmail(userData.email, token);

                return h.response(ACTIVATION_ACCEPTED).code(200);
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