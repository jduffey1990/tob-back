"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/index.ts
const userRoutes_1 = require("./userRoutes");
const loginRoutes_1 = require("./loginRoutes");
const tokenRoutes_1 = require("./tokenRoutes");
const prayerRoutes_1 = require("./prayerRoutes");
const prayOnItRoutes_1 = require("./prayOnItRoutes");
const ttsRoutes_1 = require("./ttsRoutes");
const redisRoutes_1 = require("./redisRoutes");
const audioRoutes_1 = require("./audioRoutes");
const passwordResetRoutes_1 = require("./passwordResetRoutes");
const denominationRoutes_1 = require("./denominationRoutes");
const appleRoutes_1 = require("./appleRoutes");
const playlistRoutes_1 = require("./playlistRoutes");
const flockRoutes_1 = require("./flockRoutes");
const deviceRoutes_1 = require("./deviceRoutes");
exports.default = [
    ...userRoutes_1.userRoutes,
    ...loginRoutes_1.homeRoutes,
    ...loginRoutes_1.loginRoutes,
    ...tokenRoutes_1.tokenRoutes,
    ...prayerRoutes_1.prayerRoutes,
    ...prayOnItRoutes_1.prayOnItRoutes,
    ...ttsRoutes_1.ttsRoutes,
    ...redisRoutes_1.redisRoutes,
    ...audioRoutes_1.audioRoutes,
    ...passwordResetRoutes_1.passwordResetRoutes,
    ...denominationRoutes_1.denominationRoutes,
    ...appleRoutes_1.appleRoutes,
    ...playlistRoutes_1.playlistRoutes,
    ...flockRoutes_1.flockRoutes,
    ...deviceRoutes_1.deviceRoutes
];
