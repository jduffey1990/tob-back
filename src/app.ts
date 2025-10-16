// app.ts
import dotenv from 'dotenv'
import Hapi, { type ServerRoute } from '@hapi/hapi'
import serverlessExpress from '@vendia/serverless-express'
import type { RequestListener, IncomingMessage, ServerResponse } from 'http'

import { PostgresService } from './controllers/postgres.service'
import { AuthService } from './controllers/authService'
import { homeRoutes, loginRoutes } from './routes/loginRoutes'
import { userRoutes } from './routes/userRoutes'

dotenv.config()

const NODE_ENV = process.env.NODE_ENV || 'development'
const IS_LAMBDA = NODE_ENV === 'production' || !!process.env.LAMBDA_TASK_ROOT
const PORT = Number(process.env.PORT || 3000)
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
  ...loginRoutes as unknown as ServerRoute[], // uncomment if you have it
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
  await dbService.connect()

  await server.register(require('@hapi/jwt'))

  server.auth.strategy('jwt', 'jwt', {
    keys: jwtSecret,
    verify: { aud: false, iss: false, sub: false, maxAgeSec: 60 * 60 * 4 },
    validate: AuthService.validateToken,
  })
  server.auth.default('jwt')

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
  if (!cachedLambdaHandler) {
    const server = await buildServer()
    const listener = toRequestListener(server)
    cachedLambdaHandler = serverlessExpress({ app: listener })
  }
  return cachedLambdaHandler(event, context)
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
