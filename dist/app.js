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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
// app.ts
const dotenv_1 = __importDefault(require("dotenv"));
const hapi_1 = __importDefault(require("@hapi/hapi"));
const serverless_express_1 = __importDefault(require("@vendia/serverless-express"));
const postgres_service_1 = require("./controllers/postgres.service");
const authService_1 = require("./controllers/authService");
const loginRoutes_1 = require("./routes/loginRoutes");
const userRoutes_1 = require("./routes/userRoutes");
dotenv_1.default.config();
console.log('[DB cfg]', {
    host: process.env.PGHOST,
    db: process.env.PGDATABASE,
    user: process.env.PGUSER,
    port: process.env.PGPORT,
    url: process.env.DATABASE_URL,
});
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_LAMBDA = NODE_ENV === 'production' || !!process.env.LAMBDA_TASK_ROOT;
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const jwtSecret = process.env.JWT_SECRET;
let cachedLambdaHandler;
// ---- Helper: ensure route arrays are correctly typed ----
// (Do this in each routes file instead if you prefer)
function asServerRoutes(routes) { return routes; }
// If your imported route arrays are NOT typed, you can fix them here:
const allRoutes = asServerRoutes([
    ...userRoutes_1.userRoutes,
    ...loginRoutes_1.homeRoutes,
    ...loginRoutes_1.loginRoutes, // uncomment if you have it
]);
function buildServer() {
    return __awaiter(this, void 0, void 0, function* () {
        const server = hapi_1.default.server({
            port: PORT,
            host: HOST,
            routes: IS_LAMBDA
                ? { cors: false } // CORS handled by API Gateway in prod
                : {
                    cors: {
                        origin: ['http://localhost:*', 'http://127.0.0.1:*'],
                        credentials: true,
                        additionalHeaders: ['X-CSRFToken', 'Content-Type', 'Authorization'],
                    },
                },
        });
        // Connect DB (once per cold start)
        const dbService = postgres_service_1.PostgresService.getInstance();
        yield dbService.connect({
            max: 1, // Lambda only needs 1 connection
            idleTimeoutMillis: 120000, // 2 minutes (longer than Lambda timeout)
            connectionTimeoutMillis: 5000, // 5 second timeout
        });
        yield server.register(require('@hapi/jwt'));
        server.auth.strategy('jwt', 'jwt', {
            keys: jwtSecret,
            verify: { aud: false, iss: false, sub: false, maxAgeSec: 60 * 60 * 4 },
            validate: authService_1.AuthService.validateToken,
        });
        // >>> The call that failed:
        // Make sure the array is typed as ServerRoute[]
        server.route(allRoutes);
        // In Lambda we do NOT listen; just initialize.
        yield server.initialize();
        return server;
    });
}
// Wrap Hapi's http.Server into a RequestListener for serverless-express
function toRequestListener(server) {
    return (req, res) => {
        // forward to Hapi's underlying Node server
        server.listener.emit('request', req, res);
    };
}
// ---------- Local/dev ----------
function startLocal() {
    return __awaiter(this, void 0, void 0, function* () {
        const server = yield buildServer();
        yield server.start();
        console.log(`[LOCAL] Hapi listening on ${server.info.uri} (env=${NODE_ENV})`);
        return server;
    });
}
// ---------- Lambda entry ----------
const handler = (event, context) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!cachedLambdaHandler) {
            const server = yield buildServer();
            const listener = toRequestListener(server);
            cachedLambdaHandler = (0, serverless_express_1.default)({
                app: listener,
                eventSourceName: 'AWS_API_GATEWAY_V2'
            });
        }
        return yield cachedLambdaHandler(event, context);
    }
    catch (error) {
        console.error('Lambda Error:', error);
        if (error instanceof Error) {
            console.error('Stack:', error.stack);
        }
        else {
            console.error('Non-Error thrown:', error);
        }
        throw error;
    }
});
exports.handler = handler;
// ---------- Entrypoint ----------
if (!IS_LAMBDA) {
    startLocal().catch((err) => {
        console.error('Failed to start local server:', err);
        process.exit(1);
    });
}
process.on('unhandledRejection', (err) => {
    console.error(err);
    process.exit(1);
});
