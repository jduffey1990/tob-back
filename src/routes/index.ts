// src/routes/index.ts
import { userRoutes } from './userRoutes';
import {homeRoutes, loginRoutes} from './loginRoutes';
import { tokenRoutes } from './tokenRoutes';
import { prayerRoutes } from './prayerRoutes';
import { prayOnItRoutes } from './prayOnItRoutes';
import { ttsRoutes } from './ttsRoutes';
import { redisRoutes } from './redisRoutes'
import { audioRoutes } from './audioRoutes';
import { passwordResetRoutes } from './passwordResetRoutes';
import { denominationRoutes } from './denominationRoutes';
import { appleRoutes } from './appleRoutes';

export default [
  ...userRoutes,
  ...homeRoutes,
  ...loginRoutes,
  ...tokenRoutes,
  ...prayerRoutes,
  ...prayOnItRoutes,
  ...ttsRoutes,
  ...redisRoutes,
  ...audioRoutes,
  ...passwordResetRoutes,
  ...denominationRoutes,
  ...appleRoutes
];