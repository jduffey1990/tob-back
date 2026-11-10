// src/routes/index.ts
import { userRoutes } from './userRoutes';
import {homeRoutes, loginRoutes} from './loginRoutes';
import { tokenRoutes } from './tokenRoutes';
import { prayerRoutes } from './prayerRoutes';
import { prayOnItRoutes } from './prayOnItRoutes';
import { ttsRoutes } from './ttsRoutes';
import { audioRoutes } from './audioRoutes';
import { passwordResetRoutes } from './passwordResetRoutes';
import { denominationRoutes } from './denominationRoutes';
import { appleRoutes } from './appleRoutes';
import { playlistRoutes } from './playlistRoutes'
import { flockRoutes } from './flockRoutes'
import { deviceRoutes } from './deviceRoutes'
import { appConfigRoutes } from './appConfigRoutes'

export default [
  ...userRoutes,
  ...homeRoutes,
  ...loginRoutes,
  ...tokenRoutes,
  ...prayerRoutes,
  ...prayOnItRoutes,
  ...ttsRoutes,
  ...audioRoutes,
  ...passwordResetRoutes,
  ...denominationRoutes,
  ...appleRoutes,
  ...playlistRoutes,
  ...flockRoutes,
  ...deviceRoutes,
  ...appConfigRoutes
];