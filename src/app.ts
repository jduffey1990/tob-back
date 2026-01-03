// app.ts
import Hapi, { type ServerRoute } from '@hapi/hapi'
import serverlessExpress from '@vendia/serverless-express'
import dotenv from 'dotenv'
import type { IncomingMessage, RequestListener, ServerResponse } from 'http'

import { AuthService } from './controllers/authService'
import { PostgresService } from './controllers/postgres.service'
import { homeRoutes, loginRoutes } from './routes/loginRoutes'
import { prayerRoutes } from './routes/prayerRoutes'
import { prayOnItRoutes } from './routes/prayOnItRoutes'
import { redisRoutes } from './routes/redisRoutes'
import { tokenRoutes } from './routes/tokenRoutes'
import { ttsRoutes } from './routes/ttsRoutes'
import { userRoutes } from './routes/userRoutes'

dotenv.config()

const NODE_ENV = process.env.NODE_ENV || 'development'
const IS_LAMBDA = NODE_ENV === 'production' || !!process.env.LAMBDA_TASK_ROOT
const PORT = Number(process.env.PORT || 3004)
const HOST = process.env.HOST || '0.0.0.0'
const jwtSecret = process.env.JWT_SECRET

let cachedLambdaHandler: any

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
  ...redisRoutes as unknown as ServerRoute[]
])

async function buildServer() {
  const server = Hapi.server({
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
  })

  // Connect DB (once per cold start)
  const dbService = PostgresService.getInstance()
  await dbService.connect({
    max: 1,                      // Lambda only needs 1 connection
    idleTimeoutMillis: 120000,   // 2 minutes (longer than Lambda timeout)
    connectionTimeoutMillis: 5000, // 5 second timeout
  })

  await server.register(require('@hapi/jwt'))

  server.auth.strategy('jwt', 'jwt', {
    keys: jwtSecret,
    verify: { aud: false, iss: false, sub: false, maxAgeSec: 60 * 60 * 4 },
    validate: AuthService.validateToken,
  })

  // >>> The call that failed:
  // Make sure the array is typed as ServerRoute[]
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
