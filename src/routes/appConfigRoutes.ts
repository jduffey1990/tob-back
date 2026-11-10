// src/routes/appConfigRoutes.ts
//
// Public, DB-free config the iOS client reads on launch and on foreground.
//
// Two jobs:
//   1. Serve the force-update floor (IOS_MIN_SUPPORTED_VERSION). A client
//      running below it shows a blocking "update required" screen. The
//      "a newer version exists" nag does NOT come from here: the client reads
//      the live App Store version from Apple directly, so there is nothing to
//      bump on release.
//   2. Measure. Every check logs the caller's version, so the spread of
//      installed versions is known BEFORE the floor is raised. Raising the
//      floor locks people out of the app, so look at the `app_config_check`
//      lines in CloudWatch first.
//
// Fails open on purpose: an unset or malformed env var serves 0.0.0, which
// blocks nobody. A typo in Terraform must never lock every user out.
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';

const VERSION_PATTERN = /^\d+(\.\d+){0,2}$/;
const NO_FLOOR = '0.0.0';

export function resolveMinSupportedVersion(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return NO_FLOOR;
  if (!VERSION_PATTERN.test(value)) {
    console.error(JSON.stringify({
      level: 'error',
      event: 'app_config_bad_min_version',
      value,
      message: 'IOS_MIN_SUPPORTED_VERSION is malformed; serving no floor',
    }));
    return NO_FLOOR;
  }
  return value;
}

export const appConfigRoutes: ServerRoute[] = [
  {
    method: 'GET',
    path: '/app-config',
    handler: (request: Request, h: ResponseToolkit) => {
      const { version, build } = request.query as { version?: string; build?: string };
      const minSupportedVersion = resolveMinSupportedVersion(process.env.IOS_MIN_SUPPORTED_VERSION);

      console.log(JSON.stringify({
        level: 'info',
        event: 'app_config_check',
        platform: 'ios',
        clientVersion: version ?? null,
        clientBuild: build ?? null,
        minSupportedVersion,
        timestamp: new Date().toISOString(),
      }));

      return h.response({ minSupportedVersion }).code(200);
    },
    options: {
      auth: false, // Must work before login and for guests
      validate: {
        query: Joi.object({
          version: Joi.string().pattern(VERSION_PATTERN).optional(),
          build: Joi.string().pattern(/^\d{1,10}$/).optional(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Client config: minimum supported iOS app version (public)',
      tags: ['api', 'config'],
    },
  },
];
