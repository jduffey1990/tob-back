// src/routes/passwordResetRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import bcrypt from 'bcrypt';
import { EmailService } from '../controllers/email.service';
import { passwordResetTokenService } from '../controllers/passwordResetServcie';
import { UserService } from '../controllers/userService';

const emailService = new EmailService();

export const passwordResetRoutes: ServerRoute[] = [
  // ===== REQUEST PASSWORD RESET =====
  {
    method: 'POST',
    path: '/request-password-reset',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const payload = request.payload as any;
        const { email } = payload;

        // Validation
        if (!email) {
          return h.response({ error: 'Email is required' }).code(400);
        }

        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return h.response({ error: 'Invalid email address' }).code(400);
        }

        // Find user by email
        const userData = await UserService.findUserByEmail(email);

        // Security best practice: Don't reveal if user exists
        // Always return success even if user not found
        if (!userData) {
          return h.response({
            success: true,
            message: 'If an account exists with this email, a password reset link has been sent.',
          }).code(200);
        }

        // Check if user is inactive (hasn't activated account yet)
        if (userData.status === 'inactive') {
          return h.response({ 
            error: 'Please activate your account first before resetting your password.' 
          }).code(400);
        }

        // Check if there's already an active reset token (prevent spam)
        const hasActiveToken = await passwordResetTokenService.hasActiveToken(userData.id);
        if (hasActiveToken) {
          return h.response({ 
            error: 'A password reset email was already sent. Please check your inbox or wait before requesting another.' 
          }).code(429); // Too Many Requests
        }

        // Generate password reset token
        const token = await passwordResetTokenService.createPasswordResetToken(
          userData.id,
          userData.email
        );

        // Send the password reset email
        await emailService.sendPasswordResetEmail(userData.email, token);

        return h.response({
          success: true,
          message: 'If an account exists with this email, a password reset link has been sent.',
        }).code(200);
      } catch (error: any) {
        console.error('Request password reset error:', error);
        return h.response({ 
          error: error.message || 'Failed to process password reset request' 
        }).code(500);
      }
    },
    options: { auth: false },
  },

  // ===== RESET PASSWORD WITH TOKEN =====
  {
    method: 'POST',
    path: '/reset-password',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const payload = request.payload as any;
        const { token, newPassword } = payload;

        // Validation
        if (!token || !newPassword) {
          return h.response({ 
            error: 'Token and new password are required' 
          }).code(400);
        }

        // Validate password strength (minimum 6 characters)
        if (newPassword.length < 6) {
          return h.response({ 
            error: 'Password must be at least 6 characters long' 
          }).code(400);
        }

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
      cors: true 
    },
  },

  // ===== VERIFY RESET TOKEN (Optional - for frontend to check if token is valid) =====
  {
    method: 'GET',
    path: '/verify-reset-token/{token}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { token } = request.params;

        if (!token) {
          return h.response({ 
            error: 'Token is required' 
          }).code(400);
        }

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
      cors: true
     },
  },
];