// src/routes/deviceRoutes.ts
// APNs device token registration + flock notification preference.

import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import { DeviceTokenService } from '../controllers/deviceTokenService';
import type { UserSafe } from '../models/user';

export const deviceRoutes: ServerRoute[] = [

  // ============================================
  // POST /devices/register — upsert device token
  // ============================================
  {
    method: 'POST',
    path: '/devices/register',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { apnsToken, environment } = request.payload as {
          apnsToken: string;
          environment: 'sandbox' | 'production';
        };

        const token = await DeviceTokenService.registerToken(authUser.id, apnsToken, environment);
        return h.response({ id: token.id, registered: true }).code(200);
      } catch (error: any) {
        if (error.statusCode === 400) {
          return h.response({ error: error.message }).code(400);
        }
        console.error('❌ [deviceRoutes] POST /devices/register error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          apnsToken: Joi.string().hex().min(32).max(256).required(),
          environment: Joi.string().valid('sandbox', 'production').required(),
        }),
        failAction: async (_r, _h, err) => { throw err; },
      },
      description: 'Register an APNs device token for the authed user',
      notes: 'Idempotent — same (user, token) upserts and unrevokes.',
      tags: ['api', 'devices'],
    },
  },

  // ============================================
  // DELETE /devices/{apnsToken} — revoke on logout
  // ============================================
  {
    method: 'DELETE',
    path: '/devices/{apnsToken}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { apnsToken } = request.params;
        await DeviceTokenService.revokeToken(authUser.id, apnsToken);
        return h.response({ revoked: true }).code(200);
      } catch (error: any) {
        console.error('❌ [deviceRoutes] DELETE /devices/:apnsToken error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          apnsToken: Joi.string().hex().min(32).max(256).required(),
        }),
        failAction: async (_r, _h, err) => { throw err; },
      },
      description: 'Revoke an APNs device token for the authed user',
      tags: ['api', 'devices'],
    },
  },

  // ============================================
  // GET /users/me/notification-preferences
  // ============================================
  {
    method: 'GET',
    path: '/users/me/notification-preferences',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const prefs = await DeviceTokenService.getFlockNotificationPreference(authUser.id);
        return h.response(prefs).code(200);
      } catch (error: any) {
        console.error('❌ [deviceRoutes] GET /users/me/notification-preferences error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Get the authed user\'s flock notification preference',
      tags: ['api', 'devices'],
    },
  },

  // ============================================
  // PATCH /users/me/notification-preferences
  // ============================================
  {
    method: 'PATCH',
    path: '/users/me/notification-preferences',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { flockNotificationsEnabled } = request.payload as { flockNotificationsEnabled: boolean };
        const updated = await DeviceTokenService.updateFlockNotificationPreference(
          authUser.id,
          flockNotificationsEnabled
        );
        return h.response(updated).code(200);
      } catch (error: any) {
        console.error('❌ [deviceRoutes] PATCH /users/me/notification-preferences error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          flockNotificationsEnabled: Joi.boolean().required(),
        }),
        failAction: async (_r, _h, err) => { throw err; },
      },
      description: 'Update the authed user\'s flock notification preference',
      tags: ['api', 'devices'],
    },
  },
];
