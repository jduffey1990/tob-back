// src/plugins/requestLogger.ts
// Hapi plugin for structured request/response logging
// Registers lifecycle hooks that fire on EVERY request automatically — no route changes needed.
// Type augmentation for request.app.startTime lives in src/types/hapi.d.ts

import { Plugin, Request, ResponseToolkit, Server } from '@hapi/hapi';
import Boom from '@hapi/boom';

declare module '@hapi/hapi' {
  interface RequestApplicationState {
    startTime?: number;
  }
}
interface StructuredLog {
  level: 'info' | 'warn' | 'error';
  type: 'request';
  method: string;
  path: string;
  route: string;
  statusCode: number;
  duration_ms: number;
  userId: string | null;
  userTier: string | null;
  userAgent: string | null;
  requestId: string | null;
  timestamp: string;
  error?: {
    message: string;
    stack?: string;
  };
}

// Routes/patterns to skip logging (keeps CloudWatch clean)
const SKIP_PATTERNS = [
  '/health',
];

const requestLoggerPlugin: Plugin<{}> = {
  name: 'requestLogger',
  version: '1.0.0',
  register: async (server: Server) => {

    // ─── onRequest: stamp start time ───
    server.ext('onRequest', (request: Request, h: ResponseToolkit) => {
      request.app.startTime = Date.now();
      return h.continue;
    });

    // ─── onPreResponse: log the completed request ───
    server.ext('onPreResponse', (request: Request, h: ResponseToolkit) => {
      const { response } = request;

      // Skip paths we don't care about
      if (SKIP_PATTERNS.includes(request.path)) {
        return h.continue;
      }

      // Calculate duration
      const duration_ms = request.app.startTime
        ? Date.now() - request.app.startTime
        : -1;

      // Extract status code (Boom errors vs normal responses)
      let statusCode: number;
      let errorInfo: StructuredLog['error'] | undefined;

      if (response instanceof Error) {
        // Boom errors (4xx, 5xx) or unhandled throws
        const boomError = response as Boom.Boom;
        statusCode = boomError.output?.statusCode || 500;
        errorInfo = {
          message: boomError.message || 'Unknown error',
          stack: statusCode >= 500 ? boomError.stack : undefined,
        };
      } else {
        statusCode = response.statusCode;
      }

      // Extract user info from JWT auth (if authenticated)
      const credentials = request.auth?.credentials as any;
      const userId = credentials?.id || credentials?.userId || null;
      const userTier = credentials?.subscription_tier || credentials?.tier || null;

      // Build the structured log
      const log: StructuredLog = {
        level: statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info',
        type: 'request',
        method: request.method.toUpperCase(),
        path: request.path,
        route: request.route?.path || request.path,
        statusCode,
        duration_ms,
        userId,
        userTier,
        userAgent: request.headers['user-agent'] || null,
        requestId: request.info?.id || null,
        timestamp: new Date().toISOString(),
      };

      // Only attach error details for actual errors
      if (errorInfo) {
        log.error = errorInfo;
      }

      // Log as single-line JSON (CloudWatch Logs Insights can parse this)
      if (statusCode >= 500) {
        console.error(JSON.stringify(log));
      } else if (statusCode >= 400) {
        console.warn(JSON.stringify(log));
      } else {
        console.log(JSON.stringify(log));
      }

      // Warn on slow requests (> 5 seconds, excluding TTS which is expected to be slow)
      if (duration_ms > 5000 && !request.path.includes('/tts') && !request.path.includes('/ai-gen')) {
        console.warn(JSON.stringify({
          level: 'warn',
          type: 'slow_request',
          method: request.method.toUpperCase(),
          path: request.path,
          route: request.route?.path || request.path,
          duration_ms,
          userId,
          timestamp: new Date().toISOString(),
        }));
      }

      return h.continue;
    });
  },
};

export default requestLoggerPlugin;