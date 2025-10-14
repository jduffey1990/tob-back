import { Request, ResponseToolkit } from '@hapi/hapi';
import { AuthService } from '../controllers/authService'; 

export const homeRoutes = [
    {
        method: 'GET',
        path: '/',
        handler: (request: Request, h: ResponseToolkit) => {
            return 'Welcome to the restricted home page!';
        }
    }
];

export const loginRoutes = [
    {
        method: 'POST',
        path: '/login',
        handler: async (request: Request, h: ResponseToolkit) => {
          const { username, password } = request.payload as { username: string; password: string };
    
          const { isValid, credentials: user, token } = await AuthService.validateUser(request, username, password, h);
          if (!isValid) {
            return h.response({ message: "Invalid credentials" }).code(401);
          }

          // user must activate account through email verification first
          if (user && user.status !== 'active') {
            return h.response({
              error: 'USER_INACTIVE',
              message: 'Please verify your email to activate your account.',
            }).code(403);
          }
    
          if (user) {
            return h.response({ token, user: user}).code(200);
          }
      
          return h.response({ message: 'No user found' }).code(404);
        },
        options: { auth: false } // Allow unauthenticated access for login
      },
];

