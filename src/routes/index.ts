// src/routes/index.ts
import { userRoutes } from './userRoutes';
import {homeRoutes, loginRoutes} from './loginRoutes';

export default [
  ...userRoutes,
  ...homeRoutes,
  ...loginRoutes
];