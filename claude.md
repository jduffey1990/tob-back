# CLAUDE.md - Tower of Babble Backend

## Project Overview
Node.js + TypeScript backend for a prayer iOS app. Hapi.js server deployed to AWS Lambda via serverless-express. PostgreSQL (Neon serverless) + Redis (Upstash) + S3 for audio files.

## Key Commands
```bash
npm run build          # TypeScript → dist/
npm run dev            # Local dev with nodemon
npm test               # Jest test suite
npm run migrate:up     # Run DB migrations
```

## Architecture
- **Framework**: Hapi.js (NOT Express — Hapi has its own patterns for validation, auth, plugins)
- **Auth**: @hapi/jwt strategy, registered globally in app.ts. Routes opt in with `options: { auth: 'jwt' }`
- **DB**: PostgresService singleton at `src/controllers/postgres.service.ts`
- **Errors**: Custom error classes at `src/errors/AppErrors.ts` with central handler at `src/errors/handleRouteError.ts`
- **Monitoring**: Hapi lifecycle plugin at `src/plugins/requestLogger.ts` — logs every request as structured JSON

## Error Handling System
All service-layer errors use typed classes from `src/errors/AppErrors.ts`:
- `NotFoundError('Prayer')` → 404
- `LimitReachedError('message')` → 402 with `{ error, message, upgradeRequired: true }`
- `ValidationError('message')` → 400
- `ExternalServiceError('service', 'message')` → 503
- `ConflictError('message')` → 409
- `RateLimitError()` → 429

Every route catch block uses: `catch (error) { return handleRouteError(error, h); }`

Import from barrel: `import { NotFoundError, handleRouteError } from '../errors';`

**CRITICAL**: The iOS client (SwiftUI) expects specific status codes and response shapes. Do NOT change HTTP status codes or response body structure for existing error cases.

---

## ACTIVE TASK: Joi Validation Migration

### What This Is
Replace all manual `if (!payload.field)` validation in route handlers with Hapi's built-in Joi validation. Joi schemas go in the route's `options.validate` block. Hapi runs validation BEFORE the handler — if validation fails, Hapi returns a 400 automatically without the handler ever executing.

### Package
Joi is already available via `@hapi/hapi` — use `import Joi from 'joi'` (install `@hapi/joi` if not present, or use the `joi` package directly).

### The Pattern

BEFORE (manual validation inside handler):
```typescript
{
  method: 'POST',
  path: '/prayers',
  handler: async (request: Request, h: ResponseToolkit) => {
    try {
      const authUser = request.auth.credentials as UserSafe;
      const payload = request.payload as { title: string; text: string; category?: string };
      
      if (!payload.title || !payload.text) {
        return h.response({ error: 'title and text are required' }).code(400);
      }
      
      if (payload.title.length > 255) {
        return h.response({ error: 'title must be 255 characters or less' }).code(400);
      }
      
      // ... actual business logic
    } catch (error) {
      return handleRouteError(error, h);
    }
  },
  options: { auth: 'jwt' }
}
```

AFTER (Joi schema in options.validate):
```typescript
{
  method: 'POST',
  path: '/prayers',
  handler: async (request: Request, h: ResponseToolkit) => {
    try {
      const authUser = request.auth.credentials as UserSafe;
      const { title, text, category } = request.payload as {
        title: string;
        text: string;
        category?: string;
      };
      
      // Validation already passed — go straight to business logic
      await PrayerLimitService.checkCanCreatePrayer(authUser.id);
      
      const newPrayer = await PrayerService.createPrayer({
        userId: authUser.id,
        title: title.trim(),
        text: text.trim(),
        category: category?.trim() || undefined,
        isTemplate: false
      });
      
      return h.response(newPrayer).code(201);
    } catch (error) {
      return handleRouteError(error, h);
    }
  },
  options: {
    auth: 'jwt',
    validate: {
      payload: Joi.object({
        title: Joi.string().required().max(255).trim(),
        text: Joi.string().required().trim(),
        category: Joi.string().optional().trim().allow('', null),
      }),
      failAction: async (request, h, err) => {
        throw err; // Returns 400 with Joi's validation message
      }
    },
    description: 'Create a new prayer',
    tags: ['api', 'prayers']
  }
}
```

### failAction
Always include `failAction: async (request, h, err) => { throw err; }` in every validate block. Without this, Hapi may swallow the error in some configurations. This ensures a clean 400 with Joi's message reaches the client.

### Route params and query validation
Joi validation isn't just for payloads. Use it for params and query strings too:

```typescript
options: {
  auth: 'jwt',
  validate: {
    params: Joi.object({
      id: Joi.string().uuid().required(),
    }),
    query: Joi.object({
      voiceId: Joi.string().required(),
    }),
    failAction: async (request, h, err) => { throw err; }
  }
}
```

### Files to Migrate (in priority order)

1. **`src/routes/prayerRoutes.ts`** — Most validation-heavy. Has manual checks for title, text, category, title length. The `POST /prayers/ai-gen` route has complex payload validation (prayerType, tone, length, prayOnItItems OR customContext required).

2. **`src/routes/prayOnItRoutes.ts`** — Has ~15 lines of manual validation per handler: name, category (enum), relationship (max 100), prayerFocus (max 100), notes (max 200). Category must be one of: family, friends, work, health, personal, world, other.

3. **`src/routes/audioRoutes.ts`** — Needs params validation (prayer id as UUID) and query validation (voiceId required on some routes).

4. **`src/routes/playlistRoutes.ts`** — Payload validation for name, prayerIds array.

5. **`src/routes/userRoutes.ts`** — Settings validation (voiceIndex 0-8, playbackRate 0-1), profile updates.

6. **`src/routes/loginRoutes.ts`** — Email and password on login/register. Email format validation. Password minimum length.

7. **`src/routes/passwordResetRoutes.ts`** — Token validation, new password minimum length.

8. **`src/routes/ttsRoutes.ts`** — voiceId required in payload.

9. **`src/routes/denominationRoutes.ts`** — Check what validation exists.

10. **`src/routes/appleRoutes.ts`** — Apple receipt/transaction validation.

### Business Logic Validation Stays in Handlers
Joi handles STRUCTURAL validation (field exists, correct type, length limits, enum values). Business logic validation stays in the handler or service layer:
- Prayer limit checks → `PrayerLimitService.checkCanCreatePrayer()` (throws LimitReachedError)
- AI generation limits → `AIService.checkCanGenerate()` (throws LimitReachedError)
- Ownership verification → service layer returns null, handler throws NotFoundError
- The "prayOnItItems OR customContext required" check on ai-gen is borderline — can be done with Joi's `.or()` or `.xor()` or left in handler

### What NOT to Change
- Do NOT change error response shapes — iOS client depends on them
- Do NOT remove the `catch (error) { return handleRouteError(error, h) }` pattern
- Do NOT change auth configuration on any route
- Do NOT change the actual business logic inside handlers
- Keep existing route descriptions and tags

### Removing Old Validation Code
After adding Joi schema, DELETE the manual validation lines from the handler. Don't leave them as dead code. The whole point is that Joi runs first and the handler only contains business logic.

### Using model as validation instead of duplicating code
-Example: [text](src/models/prayOnItItem.ts) has validation models (unfortuneately also heavily duplicated in that file) but validation tupels on models should be used over new ones added to route files:

```typescript
export const PRAY_ON_IT_CATEGORIES = [
  'family', 'friends', 'work', 'health', 'personal', 'world', 'other'
] as const;

export type PrayOnItCategory = typeof PRAY_ON_IT_CATEGORIES[number];

export interface PrayOnItItem {
  id: string;
  userId: string;
  name: string;
  category: PrayOnItCategory;
  // ... rest stays the same
}
```

### Testing After Each File
After converting each route file:
1. `npm run build` — must compile with no TypeScript errors
2. Test the endpoint locally if possible
3. Verify Joi returns 400 for bad input (missing required fields, wrong types)
4. Verify valid requests still work as before

### Shared Schemas (Optional Optimization)
If you notice repeated schemas across routes, extract them to `src/schemas/` directory:
```typescript
// src/schemas/prayerSchemas.ts
import Joi from 'joi';

export const createPrayerSchema = Joi.object({
  title: Joi.string().required().max(255).trim(),
  text: Joi.string().required().trim(),
  category: Joi.string().optional().trim().allow('', null),
});
```

But don't over-abstract too early — inline schemas are fine to start.