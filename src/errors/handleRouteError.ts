// src/errors/handleRouteError.ts
// Central error-to-response mapper for route handlers.
//
// BEFORE (scattered across every route):
//   catch (error: any) {
//     if (error.message.includes('LIMIT_REACHED')) { ... }
//     if (error.message.includes('not found')) { ... }
//     return h.response({ error: error.message }).code(500);
//   }
//
// AFTER (one line in every catch block):
//   catch (error) {
//     return handleRouteError(error, h);
//   }

import { ResponseToolkit } from '@hapi/hapi';
import {
  AppError,
  LimitReachedError,
  NotFoundError,
  ExternalServiceError,
  ValidationError,
  UnauthorizedError,
  ConflictError,
  ForbiddenError,
  RateLimitError
} from './AppErrors';

export function handleRouteError(error: unknown, h: ResponseToolkit) {
  // ── Known application errors (instanceof checks, never breaks) ──
  
  if (error instanceof LimitReachedError) {
    return h.response(error.toResponse()).code(error.statusCode);
  }

  if (error instanceof NotFoundError) {
    return h.response(error.toResponse()).code(error.statusCode);
  }

  if (error instanceof ExternalServiceError) {
    return h.response(error.toResponse()).code(error.statusCode);
  }

  if (error instanceof ValidationError) {
    return h.response({ error: error.message }).code(error.statusCode);
  }

  if (error instanceof UnauthorizedError) {
    return h.response({ error: error.message }).code(error.statusCode);
  }

  if (error instanceof ConflictError) {
    return h.response({ error: error.message }).code(error.statusCode);
  }

  if (error instanceof ForbiddenError) {
    return h.response(error.toResponse()).code(error.statusCode);
  }

  if (error instanceof RateLimitError) {
    return h.response({ error: error.message }).code(error.statusCode);
  }

  // ── Catch-all for any other AppError subclass we add later ──
  if (error instanceof AppError) {
    return h.response({ error: error.message }).code(error.statusCode);
  }

  // ── Unknown/unexpected errors (programmer bugs, DB failures, etc.) ──
  // These are the ones you actually want to investigate.
  const err = error instanceof Error ? error : new Error(String(error));
  
  console.error(JSON.stringify({
    level: 'error',
    type: 'unhandled_route_error',
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  }));

  return h.response({ 
    error: 'Internal server error' 
  }).code(500);
}