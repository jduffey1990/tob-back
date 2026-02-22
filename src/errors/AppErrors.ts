// src/errors/AppErrors.ts
// Custom error classes for Tower of Babble
// These replace string-matching (error.message.includes('LIMIT_REACHED')) 
// with instanceof checks that can't silently break.
//
// Each error carries its own HTTP status code and response shape,
// so route handlers don't need to know the mapping.

/**
 * Base error class for all application errors.
 * Carries an HTTP status code so the error handler plugin knows what to return.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational; // operational = expected (bad input, limits) vs programmer bug
    Object.setPrototypeOf(this, new.target.prototype); // Fix instanceof for TS
  }
}

// ============================================
// 400 - Bad Request (validation failures)
// ============================================
// Note: Joi will handle most validation, but this is useful for
// business logic validation that Joi can't express (e.g., "at least 
// one pray-on-it item OR custom context required")
export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

// ============================================
// 402 - Payment Required (tier limit reached)
// ============================================
// Used by: PrayerLimitService, PrayOnItLimitService, AIService
// iOS client checks for: { error, message, upgradeRequired: true }
export class LimitReachedError extends AppError {
  public readonly upgradeRequired: boolean;

  constructor(message: string, upgradeRequired = true) {
    super(message, 402);
    this.upgradeRequired = upgradeRequired;
  }

  /** Shape the iOS client expects for 402 responses */
  toResponse() {
    return {
      error: 'Limit reached',
      message: this.message,
      upgradeRequired: this.upgradeRequired,
    };
  }
}

// ============================================
// 404 - Not Found
// ============================================
// Used by: PrayerService, UserService, AudioService
// iOS client checks for: 404 status code
export class NotFoundError extends AppError {
  public readonly resource: string;

  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} not found: ${id}` 
      : `${resource} not found`;
    super(message, 404);
    this.resource = resource;
  }

  toResponse() {
    return {
      error: `${this.resource} not found`,
    };
  }
}

// ============================================
// 503 - Service Unavailable (external API failures)
// ============================================
// Used by: AIService (OpenAI down), TTS providers
// iOS client checks for: 503 status code + message
export class ExternalServiceError extends AppError {
  public readonly service: string;

  constructor(service: string, message: string) {
    super(message, 503);
    this.service = service;
  }

  toResponse() {
    return {
      error: `${this.service} error`,
      message: this.message,
    };
  }
}

// ============================================
// 401 - Unauthorized (handled by JWT mostly, but useful for edge cases)
// ============================================
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401);
  }
}

// ============================================
// 409 - Conflict (duplicate resources, etc.)
// ============================================
// Useful for: duplicate email on registration, etc.
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

// ============================================
// 429 - Too Many Requests (rate limiting)
// ============================================
// Will be used by the rate limiting plugin (Step 4)
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.') {
    super(message, 429);
  }
}