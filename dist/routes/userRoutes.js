"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRoutes = void 0;
const Bcrypt = require('bcrypt');
const userService_1 = require("../controllers/userService");
const userService = new userService_1.UserService();
exports.userRoutes = [
    {
        method: 'GET',
        path: '/users',
        handler: (request, h) => {
            return userService.findAllUsers();
        },
        options: {
            auth: false
        }
    },
    {
        method: 'GET',
        path: '/get-user',
        handler: (request, h) => {
            const id = request.query.id; // Access query parameter
            if (!id) {
                return h.response("User ID is required").code(400);
            }
            return userService.findUserById(id);
        }
    }
];
