# Lambda Email Broadcast Script

## Task
Create a standalone script at the root level of the project (e.g. `lambdaEmailBroadcast.ts`) that can be invoked manually from the AWS Lambda console test GUI. Comment the exact method to call this file through Lambda's test feature at the top of the file.  It should:

1. Connect to the database using the existing `PostgresService` singleton
2. Query all user emails and names from the users table
3. Send each user a personalized thank-you email
4. Log results in the same structured JSON format used by the existing request logger plugin

---

## Instructions for VS Code Claude

### Before writing a single line of code, you MUST:
- Read `src/controllers/postgres.service.ts` to understand exactly how `PostgresService` is instantiated, how queries are executed, and how the singleton is accessed
- Read `src/errors/AppErrors.ts` to understand the custom error classes available
- Read `src/errors/handleRouteError.ts` to understand the error handling pattern
- Read `src/plugins/requestLogger.ts` to understand the structured JSON logging format
- Read `app.ts` to understand how the app bootstraps, how env config is loaded, and how `@hapi/jwt` is registered — this gives you context on environment variable patterns and initialization order
- Find any existing email-sending utility in the codebase and use it exactly. If none exists, identify the email provider from environment variables or package.json and match the invocation style to whatever pattern is closest in the codebase

---

## Code Fidelity Rules

### Database
- Use `PostgresService` exactly as it is used elsewhere — same import path, same singleton access pattern, same `.query()` or `.pool` usage — do not invent a new pg connection
- Mirror the exact SQL style (parameterized queries, casing, aliasing) used in other service files
- If the users table schema is not immediately obvious, query `information_schema.columns` or read existing queries that touch the users table to confirm column names before writing the SELECT

### Email
- If an email utility/service already exists in the codebase, use it — same import, same method signature, same error handling around it
- If no utility exists, identify the provider from `package.json` or environment variables and implement the send call in the same style as any other third-party service call in the codebase
- Each email should be personalized with the user's name drawn from whatever name column(s) exist in the users table (confirm from schema or existing queries — do not assume `first_name`, `name`, or `username`)

### Email Body
Send the following message, substituting the user's name:

> Hey [name], just wanted to say thank you for your feedback this week. Thanks to all of the information you sent back to me, I think I am at the point of leaving the coding be and working a bit on marketing. If you update your app on TestFlight, you should have access to the sandbox for 90 days to use all of the premium features as a thank you for all of your feedback. Your info will still be available in the App Store application once this period runs out. That being said, feel free to update me on any problems you have in the meantime. Cheers!

### Error Handling
- Wrap all database and email operations in try/catch
- Use the existing custom error classes from `src/errors/AppErrors.ts` where semantically appropriate
- Do NOT let one failed email send abort the entire loop — log the failure for that user and continue
- Log errors in the same structured JSON format used by `src/plugins/requestLogger.ts`

### Logging
- Log a structured JSON summary at the end: total users found, emails sent successfully, emails failed
- Match the exact log format (keys, structure, use of `console.log` vs a logger instance) found in `requestLogger.ts`

### Lambda Handler Shape
- Export a `handler` function compatible with AWS Lambda (i.e. `export const handler = async (event, context) => {}`)
- The handler should not depend on Hapi being running — it is a standalone script
- Return a structured JSON response body indicating success/failure counts, consistent with how other Lambda-compatible handlers are written in this project if any exist

### TypeScript
- Match the TypeScript strictness, import style (named vs default), and file structure conventions of the rest of the codebase
- Do not introduce any new dependencies without flagging it explicitly — prefer reusing what is already in `package.json`

---

## What NOT to do
- Do not use Express patterns — this project uses Hapi.js
- Do not create a new database connection from scratch — use `PostgresService`
- Do not hardcode credentials — read from environment variables using the same pattern as the rest of the app
- Do not assume column names — verify against the schema or existing queries
- Do not swallow errors silently