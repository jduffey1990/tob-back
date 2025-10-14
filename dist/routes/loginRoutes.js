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
exports.loginRoutes = exports.homeRoutes = void 0;
const authService_1 = require("../controllers/authService");
exports.homeRoutes = [
    {
        method: 'GET',
        path: '/',
        handler: (request, h) => {
            return 'Welcome to the restricted home page!';
        }
    }
];
exports.loginRoutes = [
    {
        method: 'GET',
        path: '/login',
        handler: (request, h) => {
            return ` <html>
                            <head>
                                <title>Login page</title>
                            </head>
                            <body>
                                <h3>Please Log In</h3>
                                <form method="post" action="/login">
                                    Username: <input type="text" name="username"><br>
                                    Password: <input type="password" name="password"><br/>
                                <input type="submit" value="Login"></form>
                            </body>
                        </html>`;
        },
        options: {
            auth: false
        }
    },
    {
        method: 'POST',
        path: '/login',
        handler: (request, h) => __awaiter(void 0, void 0, void 0, function* () {
            const { username, password } = request.payload;
            const { isValid, credentials, token } = yield authService_1.AuthService.validateUser(request, username, password, h);
            if (!isValid) {
                return h.response({ message: "Invalid credentials" }).code(401);
            }
            return h.response({ token }).code(200);
        }),
        options: { auth: false } // Allow unauthenticated access for login
    },
];
