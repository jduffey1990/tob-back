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
    
          if (user) {
            // destructure out `password` so it never appears in the response
            const { password: _, ...sanitizedUser } = user;
            return h.response({ token, user: sanitizedUser }).code(200);
          }
      
          return h.response({ message: 'No user found' }).code(404);
        },
        options: { auth: false } // Allow unauthenticated access for login
      },
];

