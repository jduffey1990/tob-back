// src/errors/index.ts
// Barrel export — import everything from one place:
//   import { NotFoundError, LimitReachedError, handleRouteError } from '../errors';

export { 
  AppError,
  ValidationError,
  LimitReachedError,
  NotFoundError,
  ExternalServiceError,
  UnauthorizedError,
  ConflictError,
  RateLimitError,
} from './AppErrors';

export { handleRouteError } from './handleRouteError';