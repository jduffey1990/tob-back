// src/routes/index.ts
import { userRoutes } from './userRoutes';
import {homeRoutes, loginRoutes} from './loginRoutes';
import { tokenRoutes } from './tokenRoutes';

export default [
  ...userRoutes,
  ...homeRoutes,
  ...loginRoutes,
  ...tokenRoutes
];