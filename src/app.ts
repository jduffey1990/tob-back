// app.ts
import Hapi, { type ServerRoute } from '@hapi/hapi'
import serverlessExpress from '@vendia/serverless-express'
import dotenv from 'dotenv'
import type { IncomingMessage, RequestListener, ServerResponse } from 'http'

import { AuthService } from './controllers/authService'
import { PostgresService } from './controllers/postgres.service'
import { S3Service } from './controllers/s3.service'
import { UserService } from './controllers/userService'
import { StatsService } from './controllers/statsService';
import { audioRoutes } from './routes/audioRoutes'
import { homeRoutes, loginRoutes } from './routes/loginRoutes'
import { passwordResetRoutes } from './routes/passwordResetRoutes'
import { prayerRoutes } from './routes/prayerRoutes'
import { prayOnItRoutes } from './routes/prayOnItRoutes'
import { redisRoutes } from './routes/redisRoutes'
import { tokenRoutes } from './routes/tokenRoutes'
import { ttsRoutes } from './routes/ttsRoutes'
import { userRoutes } from './routes/userRoutes'
import { denominationRoutes } from './routes/denominationRoutes'

dotenv.config()

const NODE_ENV = process.env.NODE_ENV || 'development'
const IS_LAMBDA = NODE_ENV === 'production' || !!process.env.LAMBDA_TASK_ROOT
const PORT = Number(process.env.PORT || 3004)
const HOST = process.env.HOST || '0.0.0.0'
const jwtSecret = process.env.JWT_SECRET

let cachedLambdaHandler: any

console.log('Node version:', process.version);

// ---- Helper: ensure route arrays are correctly typed ----
// (Do this in each routes file instead if you prefer)
function asServerRoutes<T extends ServerRoute[]>(routes: T): T { return routes }

// If your imported route arrays are NOT typed, you can fix them here:
const allRoutes = asServerRoutes([
  ...userRoutes as unknown as ServerRoute[],
  ...homeRoutes as unknown as ServerRoute[],
  ...loginRoutes as unknown as ServerRoute[],
  ...tokenRoutes as unknown as ServerRoute[],
  ...prayerRoutes as unknown as ServerRoute[],
  ...prayOnItRoutes as unknown as ServerRoute[],
  ...ttsRoutes as unknown as ServerRoute[],
  ...redisRoutes as unknown as ServerRoute[],
  ...audioRoutes as unknown as ServerRoute[],
  ...passwordResetRoutes as unknown as ServerRoute[],
  ...denominationRoutes as unknown as ServerRoute[]
])

async function buildServer() {
  // Define allowed origins for CORS
  // Note: Native iOS app doesn't send Origin header, so it's unaffected by CORS
  // CORS only restricts browsers from making cross-origin requests
  const allowedOrigins = NODE_ENV === 'development'
  ? ['*']  // ✅ Allow all origins in development
  : [
      'https://tobprayer.app',
      'https://www.tobprayer.app'
    ]

  const server = Hapi.server({
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
  })

  // Connect DB (once per cold start)
  const dbService = PostgresService.getInstance()
  await dbService.connect({
    max: 1,                      // Lambda only needs 1 connection
    idleTimeoutMillis: 120000,   // 2 minutes (longer than Lambda timeout)
    connectionTimeoutMillis: 5000, // 5 second timeout
  })

  S3Service.initialize()

  await server.register(require('@hapi/jwt'))

  server.auth.strategy('jwt', 'jwt', {
    keys: jwtSecret,
    verify: { aud: false, iss: false, sub: false, maxAgeSec: 60 * 60 * 4 },
    validate: AuthService.validateToken,
  })

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
  server.route(allRoutes)

  // In Lambda we do NOT listen; just initialize.
  await server.initialize()
  return server
}

// Wrap Hapi's http.Server into a RequestListener for serverless-express
function toRequestListener(server: Hapi.Server): RequestListener {
  return (req: IncomingMessage, res: ServerResponse<IncomingMessage>) => {
    // forward to Hapi's underlying Node server
    server.listener.emit('request', req, res)
  }
}

// ---------- Local/dev ----------
async function startLocal() {
  const server = await buildServer()
  await server.start()
  console.log(`[LOCAL] Hapi listening on ${server.info.uri} (env=${NODE_ENV})`)
  return server
}

// ---------- Lambda entry ----------
export const handler = async (event: any, context: any) => {
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
      const result = await UserService.cleanupOldDeletedUsers();
      console.log(`✅ Cleanup complete: Deleted ${result.deletedCount} users`);
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          deletedCount: result.deletedCount,
          message: `Deleted ${result.deletedCount} users`
        })
      };
    } catch (error: any) {
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
      const stats = await StatsService.gatherAndSendDailyStats();
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
    } catch (error: any) {
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
      const server = await buildServer()
      const listener = toRequestListener(server)
      cachedLambdaHandler = serverlessExpress({ 
        app: listener,
        eventSourceName: 'AWS_API_GATEWAY_V2'
      })
    }
    
    return await cachedLambdaHandler(event, context)
  } catch (error) {
    console.error('Lambda Error:', error);
    if (error instanceof Error) {
      console.error('Stack:', error.stack);
    } else {
      console.error('Non-Error thrown:', error);
    }
    throw error;
  }
}



// ---------- Entrypoint ----------
if (!IS_LAMBDA) {
  startLocal().catch((err) => {
    console.error('Failed to start local server:', err)
    process.exit(1)
  })
}

process.on('unhandledRejection', (err) => {
  console.error(err)
  process.exit(1)
})