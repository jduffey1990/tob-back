// src/routes/users.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import axios from 'axios';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

import { EmailService } from '../controllers/email.service';
import { UserService } from '../controllers/userService';
import { UserSettings } from '../models/user';
import type { UserSafe } from '../models/user'; // our TS model (id is string UUID)
import { activationTokenService } from '../controllers/tokenService';



async function verifyCaptcha(token: string | null, minScore = 0.5): Promise<{ success: boolean; score: number | null }> {
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
    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: secretKey,
          response: token,
        },
      }
    );

    const { success, score, action } = response.data;

    if (!success) {
      throw new Error('CAPTCHA verification failed');
    }

    if (score < minScore) {
      throw new Error(`CAPTCHA score too low: ${score}`);
    }
    return { success: true, score };
  } catch (error: any) {
    console.error('CAPTCHA verification error:', error.message);
    throw error;
  }
}


export const userRoutes : ServerRoute[] = [
  // find all them hoes
  { 
    method: 'GET', 
    path: '/users', 
    handler: (request: Request, h: ResponseToolkit) => { 
      return UserService.findAllUsers() 
    }, 
    options: { auth: false  } 
  },

  // Simple health check
  {
    method: 'GET',
    path: '/ping-user',
    handler: (_request: Request, h: ResponseToolkit) => {
      return h.response('pinged backend').code(200);
    },
    options: { auth: false },
  },

  // Get a single user by id (UUID) - requires auth by default;
  {
    method: 'GET',
    path: '/get-user',
    handler: async (request: Request, h: ResponseToolkit) => {
      const id = request.query.id as string | undefined;
      if (!id) return h.response('User ID is required').code(400);

      // Optional: basic UUID sanity check
      if (!/^[0-9a-fA-F-]{36}$/.test(id)) {
        return h.response('Invalid user id format').code(400);
      }

      const user = await UserService.findUserById(id);
      if (!user) return h.response({ error: 'User not found' }).code(404);
      return h.response(user).code(200);
    },
    options: { auth: 'jwt' },
  },

  // Update the authenticated user's name/email
  {
    method: 'PATCH',
    path: '/edit-user',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe | undefined;
        if (!authUser?.id) return h.response({ error: 'Unauthorized' }).code(401);

        const payload = request.payload as Partial<{
          name: string;
          email: string;
          status: string;
          subscriptionTier: string;
          subscriptionExpiresAt: Date | null;
          // Or support firstName/lastName separately:
          firstName: string;
          lastName: string;
        }>;

        // Build updates object
        const updates: any = { ...payload };
        
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
        const updatedUser = await UserService.updateUser(authUser.id, updates);
        return h.response(updatedUser).code(200);
      } catch (error: any) {
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { auth: 'jwt' },
  },

  // Update the authenticated user's name/email
  {
    method: 'PATCH',
    path: '/activate-user',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        // Your JWT validate step returns credentials = UserSafe
        const authUser = request.auth.credentials as UserSafe | undefined;
        if (!authUser?.id) return h.response({ error: 'Unauthorized' }).code(401);

        const updatedUser = await UserService.activateUser(authUser.id);
        return h.response(updatedUser).code(200);
      } catch (error: any) {
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { auth: 'jwt' },
  },

  // Return the current session's user (already validated by @hapi/jwt)
  {
    method: 'GET',
    path: '/session',
    handler: async (request: Request) => {
      const user = request.auth.credentials as UserSafe | undefined;
      return { user };
    },
    options: { auth: 'jwt' },
  },

  // Create a new user (public signup)
  {
    method: 'POST',
    path: '/create-user',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const payload = request.payload as any;
        
        // Parse name from either 'name' field or 'firstName' + 'lastName'
        const name =
          payload.name?.toString().trim() ||
          `${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim();
        
        // Validate required fields
        if (!payload.email || !payload.password || !name) {
          return h
            .response({ error: 'email, password, and name are required' })
            .code(400);
        }
        
        // Hash password (8 rounds is fine for bcrypt)
        const passwordHash = await bcrypt.hash(payload.password, 8);
        
        // Create user
        // Note: subscriptionTier defaults to 'free' in DB
        //       subscriptionExpiresAt defaults to NULL
        //       status set to 'inactive' (requires email verification)
        const newUser = await UserService.createUser({
          email: payload.email.toLowerCase(),
          name,
          passwordHash,
          status: "inactive"
        });
        
        // Create activation token
        const activationToken = await activationTokenService.createActivationToken(
          newUser.id, 
          newUser.email
        );

        // Send activation email
        const emailService = new EmailService();
        await emailService.sendActivationEmail(newUser.email, activationToken);

        
        return h.response(newUser).code(201);
      } catch (error: any) {
        console.error('Create user error:', error);
        
        // Handle duplicate email
        if (error.message?.includes('duplicate key')) {
          return h.response({ 
            error: 'An account with this email already exists' 
          }).code(409);
        }
        
        // Handle other errors
        return h.response({ 
          error: error.message || 'Failed to create account' 
        }).code(500);
      }
    },
    options: { auth: false }
  },


  // Return the current session's user (already validated by @hapi/jwt)
  {
    method: 'DELETE',
    path: '/hard-delete/{userId}',
    handler: async (request: Request, h: ResponseToolkit) => {
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
        
        await UserService.hardDelete(userId);
        
        return h.response({ 
          success: true, 
          message: 'User permanently deleted' 
        }).code(200);
      } catch (error: any) {
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: false,  // Or require admin auth
      tags: ['api', 'users', 'dangerous'],
      description: '⚠️ DEV ONLY: Permanently delete user'
    },
  },

  // PATCH /users/me/settings - Update authenticated user's settings
  {
    method: 'PATCH',
    path: '/users/me/settings',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe | undefined;
        if (!authUser?.id) {
          return h.response({ error: 'Unauthorized' }).code(401);
        }

        const payload = request.payload as Partial<UserSettings>;
        
        // Validate payload
        if (payload.voiceIndex !== undefined && typeof payload.voiceIndex !== 'number') {
          return h.response({ error: 'voiceIndex must be a number' }).code(400);
        }
        
        if (payload.playbackRate !== undefined && typeof payload.playbackRate !== 'number') {
          return h.response({ error: 'playbackRate must be a number' }).code(400);
        }

        const updatedUser = await UserService.updateSettings(authUser.id, payload);
        
        return h.response(updatedUser).code(200);
      } catch (err: any) {
        console.error('Error updating settings:', err);
        return h.response({ error: err.message || 'Failed to update settings' }).code(400);
      }
    },
    options: { auth: 'jwt' },
  },

  // GET /users/me/settings - Get authenticated user's settings
  {
    method: 'GET',
    path: '/users/me/settings',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe | undefined;
        if (!authUser?.id) {
          return h.response({ error: 'Unauthorized' }).code(401);
        }

        const user = await UserService.findUserById(authUser.id);
        if (!user) {
          return h.response({ error: 'User not found' }).code(404);
        }

        return h.response(user.settings).code(200);
      } catch (err: any) {
        console.error('Error fetching settings:', err);
        return h.response({ error: 'Failed to fetch settings' }).code(500);
      }
    },
    options: { auth: 'jwt' },
  }

];
