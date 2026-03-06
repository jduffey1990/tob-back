import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import { AuthService } from '../controllers/authService';

export const homeRoutes : ServerRoute [] = [
    {
        method: 'GET',
        path: '/',
        handler: (request: Request, h: ResponseToolkit) => {
            return 'Welcome to the restricted home page!';
        },
        options: { auth: 'jwt' } // Allow unauthenticated access for login
      }
];

export const loginRoutes: ServerRoute [] = [
    {
    method: 'POST',
    path: '/login',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        console.log('🔵 Login request received:', request.payload);
        // Change username to email:
        const { email, password } = request.payload as { email: string; password: string };

        const { isValid, credentials: user, token } = await AuthService.validateUser(request, email, password, h);
        
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
      } catch (error) {
        console.error('❌❌❌ LOGIN ERROR:', error);
        throw error; 
      }
    },
    options: {
      auth: false,
      validate: {
        payload: Joi.object({
          email: Joi.string().email().required(),
          password: Joi.string().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
    },
  },
];

