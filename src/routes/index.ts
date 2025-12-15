// src/routes/index.ts
import { userRoutes } from './userRoutes';
import {homeRoutes, loginRoutes} from './loginRoutes';
import { tokenRoutes } from './tokenRoutes';
import { prayerRoutes } from './prayerRoutes';
import { prayOnItRoutes } from './prayOnItRoutes';

export default [
  ...userRoutes,
  ...homeRoutes,
  ...loginRoutes,
  ...tokenRoutes,
  ...prayerRoutes,
  ...prayOnItRoutes
];