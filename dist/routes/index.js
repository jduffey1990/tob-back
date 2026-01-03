"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const userRoutes_1 = require("./userRoutes");
const loginRoutes_1 = require("./loginRoutes");
const tokenRoutes_1 = require("./tokenRoutes");
const prayerRoutes_1 = require("./prayerRoutes");
const prayOnItRoutes_1 = require("./prayOnItRoutes");
const ttsRoutes_1 = require("./ttsRoutes");
const redis_service_1 = require("../controllers/redis.service");
exports.default = [
    ...userRoutes_1.userRoutes,
    ...loginRoutes_1.homeRoutes,
    ...loginRoutes_1.loginRoutes,
    ...tokenRoutes_1.tokenRoutes,
    ...prayerRoutes_1.prayerRoutes,
    ...prayOnItRoutes_1.prayOnItRoutes,
    ...ttsRoutes_1.ttsRoutes,
    {
        method: 'GET',
        path: '/test-redis',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            const redis = redis_service_1.RedisService.getInstance();
            yield redis.set('test-key', 'hello-redis');
            const value = yield redis.get('test-key');
            return { success: true, value };
        }),
        options: { auth: false }
    }
];
