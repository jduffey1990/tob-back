// index.ts (or wherever your Hapi server starts)
const Hapi = require('@hapi/hapi');
import dotenv from 'dotenv';

import { PostgresService } from './controllers/postgres.service';
import { AuthService } from './controllers/authService';
import { UserService } from './controllers/userService';

import { homeRoutes, loginRoutes } from "./routes/loginRoutes";
import { userRoutes } from './routes/userRoutes';
import { ResponseToolkit } from '@hapi/hapi';

dotenv.config();
const jwtSecret = process.env.JWT_SECRET;

const init = async () => {
  console.log('Initializing server...');
  const server = Hapi.server({
    port: 3000,
    host: '0.0.0.0',
    routes: {
      cors: {
        origin: ['http://localhost:*'],    
        credentials: true,                 // allow cookies / Authorization headers
        additionalHeaders: ['X-CSRFToken', 'Content-Type', 'Authorization'] // <-- Add this globally]
      },
    },
  });

  // 1. Connect to MongoDB once
  const dbService = PostgresService.getInstance();
  await dbService.connect(); // This ensures `dbService.getDb()` is ready.

    await server.register(require('@hapi/jwt'));

    server.auth.strategy('jwt', 'jwt', {
    keys: jwtSecret,
    verify: { 
        aud: false,
        iss: false,
        sub: false,
        maxAgeSec: 14400, // Tokens expire in 4 hours
    },
    validate: AuthService.validateToken
    });

    server.auth.default('jwt');

  // 3. Register routes
  server.route([...userRoutes, ...loginRoutes, ...homeRoutes]);
  await server.start();
  console.log('Server running on %s', server.info.uri);
};

init().catch(err => {
  console.error('Failed to start the server:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.log(err);
  process.exit(1);
});