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
const hapi_1 = __importDefault(require("@hapi/hapi"));
const serverless_express_1 = __importDefault(require("@vendia/serverless-express"));
const dotenv_1 = __importDefault(require("dotenv"));
const authService_1 = require("./controllers/authService");
const postgres_service_1 = require("./controllers/postgres.service");
const s3_service_1 = require("./controllers/s3.service");
const userService_1 = require("./controllers/userService");
const statsService_1 = require("./controllers/statsService");
const audioRoutes_1 = require("./routes/audioRoutes");
const loginRoutes_1 = require("./routes/loginRoutes");
const passwordResetRoutes_1 = require("./routes/passwordResetRoutes");
const prayerRoutes_1 = require("./routes/prayerRoutes");
const prayOnItRoutes_1 = require("./routes/prayOnItRoutes");
const redisRoutes_1 = require("./routes/redisRoutes");
const tokenRoutes_1 = require("./routes/tokenRoutes");
const ttsRoutes_1 = require("./routes/ttsRoutes");
const userRoutes_1 = require("./routes/userRoutes");
const denominationRoutes_1 = require("./routes/denominationRoutes");
const requestLogger_1 = __importDefault(require("./plugins/requestLogger"));
dotenv_1.default.config();
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_LAMBDA = NODE_ENV === 'production' || !!process.env.LAMBDA_TASK_ROOT;
const PORT = Number(process.env.PORT || 3004);
const HOST = process.env.HOST || '0.0.0.0';
const jwtSecret = process.env.JWT_SECRET;
let cachedLambdaHandler;
console.log('Node version:', process.version);
// ---- Helper: ensure route arrays are correctly typed ----
// (Do this in each routes file instead if you prefer)
function asServerRoutes(routes) { return routes; }
// If your imported route arrays are NOT typed, you can fix them here:
const allRoutes = asServerRoutes([
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
    ...denominationRoutes_1.denominationRoutes
]);
function buildServer() {
    return __awaiter(this, void 0, void 0, function* () {
        // Define allowed origins for CORS
        // Note: Native iOS app doesn't send Origin header, so it's unaffected by CORS
        // CORS only restricts browsers from making cross-origin requests
        const allowedOrigins = NODE_ENV === 'development'
            ? ['*'] // ✅ Allow all origins in development
            : [
                'https://tobprayer.app',
                'https://www.tobprayer.app'
            ];
        const server = hapi_1.default.server({
            port: PORT,
            host: HOST,
            routes: IS_LAMBDA
                ? { cors: false } // CORS handled by API Gateway in Lambda/production
                : {
                    cors: {
                        origin: allowedOrigins,
                        credentials: true,
                        additionalHeaders: ['cache-control', 'x-requested-with', 'content-type', 'authorization'],
                        additionalExposedHeaders: ['cache-control', 'x-requested-with'],
                        headers: ['Accept', 'Authorization', 'Content-Type', 'If-None-Match', 'X-CSRFToken']
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
        s3_service_1.S3Service.initialize();
        yield server.register(require('@hapi/jwt'));
        yield server.register(requestLogger_1.default);
        server.auth.strategy('jwt', 'jwt', {
            keys: jwtSecret,
            verify: { aud: false, iss: false, sub: false, maxAgeSec: 60 * 60 * 4 },
            validate: authService_1.AuthService.validateToken,
        });
        // Handle OPTIONS requests for CORS preflight (for non-Lambda environments)
        // Lambda/API Gateway handles this automatically
        if (!IS_LAMBDA) {
            server.route({
                method: 'OPTIONS',
                path: '/{any*}',
                handler: (request, h) => {
                    const response = h.response().code(200);
                    // Manually set the missing header
                    response.header('Access-Control-Allow-Headers', 'content-type, authorization, cache-control, x-requested-with');
                    response.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
                    return response;
                },
                options: {
                    auth: false,
                    cors: {
                        origin: allowedOrigins,
                        credentials: true,
                        additionalHeaders: ['cache-control', 'x-requested-with', 'content-type', 'authorization'],
                        additionalExposedHeaders: ['cache-control', 'x-requested-with'],
                        headers: ['Accept', 'Authorization', 'Content-Type', 'If-None-Match', 'X-CSRFToken']
                    }
                }
            });
        }
        // Register all application routes
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
    // Handle EventBridge warm-up ping (every 5 minutes)
    if (event.action === 'warmup') {
        console.log('🔥 Warm-up ping received');
        return {
            statusCode: 200,
            body: JSON.stringify({ status: 'warm' })
        };
    }
    // Handle EventBridge scheduled cleanup event
    if (event.action === 'cleanup_deleted_data') {
        console.log('🗑️  Running scheduled data cleanup...');
        try {
            const result = yield userService_1.UserService.cleanupOldDeletedUsers();
            console.log(`✅ Cleanup complete: Deleted ${result.deletedCount} users`);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    deletedCount: result.deletedCount,
                    message: `Deleted ${result.deletedCount} users`
                })
            };
        }
        catch (error) {
            console.error('❌ Cleanup failed:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    success: false,
                    error: error.message
                })
            };
        }
    }
    if (event.action === 'send_daily_stats') {
        console.log('📊 Running daily stats digest...');
        try {
            const stats = yield statsService_1.StatsService.gatherAndSendDailyStats();
            console.log(`✅ Daily stats sent. Total users: ${stats.users.totalUsers}`);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    success: true,
                    message: 'Daily stats email sent',
                    summary: {
                        totalUsers: stats.users.totalUsers,
                        newUsers24h: stats.users.newUsersLast24h,
                        totalPrayers: stats.content.totalPrayers,
                        aiGenerations24h: stats.ai.generationsLast24h,
                    }
                })
            };
        }
        catch (error) {
            console.error('❌ Daily stats failed:', error);
            return {
                statusCode: 500,
                body: JSON.stringify({
                    success: false,
                    error: error.message
                })
            };
        }
    }
    // Otherwise, handle normal HTTP requests via serverless-express
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
