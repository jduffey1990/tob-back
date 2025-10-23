// src/routes/users.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';
import axios from 'axios';

import { UserService } from '../controllers/userService';
import type { User, UserSafe } from '../models/user';          // our TS model (id is string UUID)


// Initialize Stripe (if needed at some point)
// const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
//   apiVersion: '2025-02-24.acacia', // if this blows up, omit apiVersion to use pkg default
// });
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

    console.log(`CAPTCHA verified: score=${score}, action=${action}`);
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
          companyId: string | null;
          // Or support firstName/lastName separately:
          firstName: string;
          lastName: string;
        }>;

        // If firstName/lastName provided, convert to name
        const updates: any = { ...payload };
        if (payload.firstName || payload.lastName) {
          const firstName = payload.firstName || authUser.name.split(' ')[0] || '';
          const lastName = payload.lastName || authUser.name.split(' ').slice(1).join(' ') || '';
          updates.name = `${firstName} ${lastName}`.trim();
          delete updates.firstName;
          delete updates.lastName;
        }

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

        // 1. Verify CAPTCHA first
        try {
          await verifyCaptcha(payload.captchaToken, 0.5);
        } catch (captchaError: any) {
          return h
            .response({ 
              error: 'Security verification failed',
              message: captchaError.message 
            })
            .code(400);
        }

        // 2. Validate required fields
        const name =
          payload.name?.toString().trim() ||
          `${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim();

        if (!payload.email || !payload.password || !name) {
          return h
            .response({ error: 'email, password, and name are required' })
            .code(400);
        }

        // 3. Hash password
        const passwordHash = await bcrypt.hash(payload.password, 10);

        // 4. Create user
        const newUser = await UserService.createUser({
          email: payload.email.toLowerCase(),
          name,
          passwordHash,
          companyId: payload.companyId ?? null, // Note: using brandId from payload
          status: "inactive"
        });

        return h.response(newUser).code(201);
      } catch (error: any) {
        // Preserve your existing FE message for unique violations
        if (error?.message?.includes('duplicate key value violates unique constraint')) {
          return h
            .response({ error: 'duplicate key value violates unique constraint' })
            .code(400);
        }
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { auth: false },
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
  }

];
