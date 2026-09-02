// src/routes/passwordResetRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import bcrypt from 'bcrypt';
import { EmailService } from '../controllers/email.service';
import { passwordResetTokenService } from '../controllers/passwordResetServcie';
import { UserService } from '../controllers/userService';

const emailService = new EmailService();

// One response for every outcome that depends on account state, so the route
// cannot be used to test which addresses have accounts. Malformed input still
// 400s -- that reveals nothing about the database.
const RESET_ACCEPTED = {
  success: true,
  message: 'If an account exists with this email, a password reset link has been sent.',
};

export const passwordResetRoutes: ServerRoute[] = [
  // ===== REQUEST PASSWORD RESET =====
  {
    method: 'POST',
    path: '/request-password-reset',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { email } = request.payload as { email: string };

        // Find user by email
        const userData = await UserService.findUserByEmail(email);

        // Every account-state outcome returns the same 200 below. The unknown-user
        // case was already handled this way; the inactive and already-sent cases
        // were not, and each told an unauthenticated caller the address was real.
        if (!userData) {
          return h.response(RESET_ACCEPTED).code(200);
        }

        // Not activated yet -- a reset link would be useless, but saying so
        // confirms the account exists.
        if (userData.status === 'inactive') {
          return h.response(RESET_ACCEPTED).code(200);
        }

        // A reset token is already outstanding. This is what bounds mail volume
        // per account; the rate limiter bounds it per IP.
        const hasActiveToken = await passwordResetTokenService.hasActiveToken(userData.id);
        if (hasActiveToken) {
          return h.response(RESET_ACCEPTED).code(200);
        }

        // Generate password reset token
        const token = await passwordResetTokenService.createPasswordResetToken(
          userData.id,
          userData.email
        );

        // Send the password reset email
        await emailService.sendPasswordResetEmail(userData.email, token);

        return h.response(RESET_ACCEPTED).code(200);
      } catch (error: any) {
        console.error('Request password reset error:', error);
        return h.response({ 
          error: error.message || 'Failed to process password reset request' 
        }).code(500);
      }
    },
    options: {
      auth: false,
      validate: {
        payload: Joi.object({
          email: Joi.string().email().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
    },
  },

  // ===== RESET PASSWORD WITH TOKEN =====
  {
    method: 'POST',
    path: '/reset-password',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { token, newPassword } = request.payload as { token: string; newPassword: string };

        // Validate token
        const tokenData = await passwordResetTokenService.validateToken(token);

        if (!tokenData) {
          return h.response({ 
            error: 'Invalid or expired password reset token' 
          }).code(400);
        }

        // Hash the new password
        const passwordHash = await bcrypt.hash(newPassword, 8);

        // Update user's password
        await UserService.updatePassword(tokenData.userId, passwordHash);

        // Mark token as used
        await passwordResetTokenService.markTokenAsUsed(token);

        return h.response({
          success: true,
          message: 'Password reset successfully. You can now log in with your new password.',
        }).code(200);

      } catch (error: any) {
        console.error('Reset password error:', error);
        return h.response({ 
          error: error.message || 'Failed to reset password' 
        }).code(500);
      }
    },
    options: {
      auth: false,
      cors: true,
      validate: {
        payload: Joi.object({
          token: Joi.string().required(),
          newPassword: Joi.string().min(6).required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
    },
  },

  // ===== VERIFY RESET TOKEN (Optional - for frontend to check if token is valid) =====
  {
    method: 'GET',
    path: '/verify-reset-token/{token}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { token } = request.params;

        // Validate token
        const tokenData = await passwordResetTokenService.validateToken(token);

        if (!tokenData) {
          return h.response({ 
            valid: false,
            error: 'Invalid or expired password reset token' 
          }).code(400);
        }

        return h.response({
          valid: true,
          email: tokenData.email,
        }).code(200);

      } catch (error: any) {
        console.error('Verify reset token error:', error);
        return h.response({ 
          valid: false,
          error: error.message || 'Failed to verify token' 
        }).code(500);
      }
    },
    options: {
      auth: false,
      cors: true,
      validate: {
        params: Joi.object({
          token: Joi.string().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
    },
  },
];