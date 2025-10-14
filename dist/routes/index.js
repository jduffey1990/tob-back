"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/index.ts
const userRoutes_1 = require("./userRoutes");
const loginRoutes_1 = require("./loginRoutes");
exports.default = [
    ...userRoutes_1.userRoutes,
    ...loginRoutes_1.homeRoutes,
    ...loginRoutes_1.loginRoutes
];
