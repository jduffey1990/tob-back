// src/routes/users.ts
import { Request, ResponseToolkit } from '@hapi/hapi';
import bcrypt from 'bcrypt';
import Stripe from 'stripe';

import { UserService } from '../controllers/userService';
import type { User, UserSafe } from '../models/user';          // our TS model (id is string UUID)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
  apiVersion: '2025-02-24.acacia', // if this blows up, omit apiVersion to use pkg default
});

export const userRoutes = [
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
    options: { auth: true },
  },

  // Update the authenticated user's name/email
  {
    method: 'PATCH',
    path: '/edit-user',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        // Your JWT validate step returns credentials = UserSafe
        const authUser = request.auth.credentials as UserSafe | undefined;
        if (!authUser?.id) return h.response({ error: 'Unauthorized' }).code(401);

        const account = request.payload as {
          firstName: string;
          lastName: string;
          email: string;
        };

        const updatedUser = await UserService.userUpdateInfo(authUser.id, account);
        return h.response(updatedUser).code(200);
      } catch (error: any) {
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { auth: true },
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
    options: { auth: true },
  },

  // Return the current session's user (already validated by @hapi/jwt)
  {
    method: 'GET',
    path: '/session',
    handler: async (request: Request) => {
      const user = request.auth.credentials as UserSafe | undefined;
      return { user };
    },
    options: { auth: true },
  },

  // Create a new user (public signup)
  {
    method: 'POST',
    path: '/create-user',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const payload = request.payload as any;

        const name =
          payload.name?.toString().trim() ||
          `${payload.firstName ?? ''} ${payload.lastName ?? ''}`.trim();

        if (!payload.email || !payload.password || !name) {
          return h
            .response({ error: 'email, password, and name are required' })
            .code(400);
        }

        const passwordHash = await bcrypt.hash(payload.password, 10);

        // If you capture companyId/status at signup, pass them here
        const newUser = await UserService.createUser({
          email: payload.email.toLowerCase(),
          name,
          passwordHash,
          companyId: payload.companyId ?? null,
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
];
