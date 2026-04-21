// src/routes/flockRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import { FlockService } from '../controllers/flockService';
import { PrayerService } from '../controllers/prayerService';
import { PrayerLimitService } from '../controllers/prayerLimitService';
import { AudioService } from '../controllers/audioService';
import { TTSService } from '../controllers/ttsService';
import { PrayOnItService } from '../controllers/prayOnItService';
import { PrayOnItCategory } from '../models/prayOnItItem';
import { NotificationService } from '../controllers/notificationService';
import type { UserSafe } from '../models/user';

const FLOCK_LEADER_TIERS = ['prayer_warrior', 'lifetime'];

function isFlockLeaderTier(tier: string): boolean {
  return FLOCK_LEADER_TIERS.includes(tier);
}

export const flockRoutes: ServerRoute[] = [

  // ============================================
  // POST /flocks - Create a flock (Prayer Warrior only)
  // ============================================
  {
    method: 'POST',
    path: '/flocks',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { name, requiresAgeVerification, minimumAge } = request.payload as {
          name: string;
          requiresAgeVerification?: boolean;
          minimumAge?: number;
        };

        if (!isFlockLeaderTier(authUser.subscriptionTier)) {
          return h.response({
            error: 'Prayer Warrior tier required to create a flock',
            upgradeRequired: true
          }).code(403);
        }

        // Check if leader already has a flock
        const existing = await FlockService.getFlockByLeader(authUser.id);
        if (existing) {
          return h.response({
            error: 'You already have a flock',
            flock: existing
          }).code(409);
        }

        const flock = await FlockService.createFlock({
          leaderUserId: authUser.id,
          name: name.trim(),
          requiresAgeVerification: requiresAgeVerification ?? false,
          minimumAge: minimumAge ?? 18,
        });

        return h.response(flock).code(201);
      } catch (error: any) {
        console.error('Create flock error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          name: Joi.string().required().max(255).trim(),
          requiresAgeVerification: Joi.boolean().optional().default(false),
          minimumAge: Joi.number().integer().min(1).max(99).optional().default(18),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Create a flock (requires Prayer Warrior tier)',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // GET /flocks/mine - Get leader's flock with stats
  // ============================================
  {
    method: 'GET',
    path: '/flocks/mine',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;

        const flock = await FlockService.getFlockByLeader(authUser.id);
        if (!flock) {
          return h.response({ flock: null }).code(200);
        }

        const prayers = await PrayerService.getLeaderFlockPrayers(authUser.id);
        const prayerRequests = await FlockService.getPrayerRequests(authUser.id);

        return h.response({
          flock,
          prayers,
          prayerRequests,
        }).code(200);
      } catch (error: any) {
        console.error('Get my flock error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Get the authenticated leader\'s flock details and published prayers',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // POST /flocks/join - Join a flock via QR code
  // ============================================
  {
    method: 'POST',
    path: '/flocks/join',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { qrCodeIdentifier, isUnderAge, parentalConsentGiven } = request.payload as {
          qrCodeIdentifier: string;
          isUnderAge?: boolean;
          parentalConsentGiven?: boolean;
        };

        const membership = await FlockService.joinFlock(qrCodeIdentifier, authUser.id, isUnderAge, parentalConsentGiven);

        return h.response({
          success: true,
          membership,
        }).code(201);
      } catch (error: any) {
        console.error('Join flock error:', error);

        if (error.message.includes('not found')) {
          return h.response({ error: 'Flock not found. Please check the QR code.' }).code(404);
        }
        if (error.message.includes('already following') || error.message.includes('cannot join your own')) {
          return h.response({ error: error.message }).code(409);
        }
        if (error.message.includes('Parental consent')) {
          return h.response({ error: error.message }).code(403);
        }

        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          qrCodeIdentifier: Joi.string().required().trim(),
          isUnderAge: Joi.boolean().optional(),
          parentalConsentGiven: Joi.boolean().optional(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Join a flock by scanning a leader\'s QR code',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // GET /flocks/feed - Member's prayer feed
  // ============================================
  {
    method: 'GET',
    path: '/flocks/feed',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;

        const feed = await PrayerService.getMemberFeed(authUser.id);
        const leaders = await FlockService.getFollowedLeaders(authUser.id);

        return h.response({
          prayers: feed,
          leaders,
          count: feed.length,
        }).code(200);
      } catch (error: any) {
        console.error('Get flock feed error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Get aggregated prayer feed from all followed leaders',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // GET /flocks/prayers/{id} - Get single flock prayer
  // ============================================
  {
    method: 'GET',
    path: '/flocks/prayers/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { id } = request.params;

        const prayer = await PrayerService.getFlockPrayerById(id);
        if (!prayer) {
          return h.response({ error: 'Flock prayer not found' }).code(404);
        }

        return h.response(prayer).code(200);
      } catch (error: any) {
        console.error('Get flock prayer error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Get a single flock prayer by ID',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // POST /flocks/prayers - Publish a prayer to flock
  // ============================================
  {
    method: 'POST',
    path: '/flocks/prayers',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { title, text, voiceId } = request.payload as {
          title: string;
          text: string;
          voiceId?: string;
        };

        if (!isFlockLeaderTier(authUser.subscriptionTier)) {
          return h.response({
            error: 'Prayer Warrior tier required to publish flock prayers',
            upgradeRequired: true
          }).code(403);
        }

        // Verify leader has a flock
        const flock = await FlockService.getFlockByLeader(authUser.id);
        if (!flock) {
          return h.response({ error: 'You need to create a flock first' }).code(400);
        }

        // Create the prayer in the unified prayers table with flock_id set
        const prayer = await PrayerService.createPrayer({
          userId: authUser.id,
          title: title.trim(),
          text: text.trim(),
          flockId: flock.id,
        });

        // Resolve voice: use provided voiceId, or fall back to user's preferred voice
        const resolvedVoiceId = voiceId || authUser.settings?.selectedVoiceId;

        if (resolvedVoiceId) {
          const resolvedVoice = await TTSService.getVoiceById(resolvedVoiceId);
          if (resolvedVoice && resolvedVoice.provider !== 'apple') {
            console.log(`[flocks] Auto-triggering TTS for flock prayer ${prayer.id}, voice: ${resolvedVoiceId}`);
            AudioService.generateInBackground(prayer.id, text.trim(), resolvedVoiceId, authUser.id);
          }
        }

        // Fire-and-forget push fan-out to flock members. Must not block or fail the
        // prayer post — mirrors the AudioService.generateInBackground pattern above.
        NotificationService.notifyFlockOfNewPrayer(
          flock.id,
          { id: prayer.id, title: prayer.title, flockId: flock.id },
          authUser.name
        ).catch((err) => {
          console.error('[flocks] push fan-out failed (non-fatal):', err?.message || err);
        });

        return h.response(prayer).code(201);
      } catch (error: any) {
        console.error('Publish flock prayer error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          title: Joi.string().required().max(255).trim(),
          text: Joi.string().required().trim(),
          voiceId: Joi.string().optional().trim().allow('', null),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Publish a prayer to the leader\'s flock',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // POST /flocks/prayers/{id}/listen - Record listen
  // ============================================
  {
    method: 'POST',
    path: '/flocks/prayers/{id}/listen',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { id } = request.params;
        const prayer = await PrayerService.recordFlockListen(id);
        return h.response(prayer).code(200);
      } catch (error: any) {
        console.error('Record flock listen error:', error);
        if (error.message.includes('not found')) {
          return h.response({ error: 'Flock prayer not found' }).code(404);
        }
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Record that a flock prayer was listened to',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // DELETE /flocks/prayers/{id} - Delete flock prayer
  // ============================================
  {
    method: 'DELETE',
    path: '/flocks/prayers/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;

        await PrayerService.deleteFlockPrayer(id, authUser.id);

        return h.response({
          success: true,
          message: 'Flock prayer deleted successfully'
        }).code(200);
      } catch (error: any) {
        console.error('Delete flock prayer error:', error);
        if (error.message.includes('not found')) {
          return h.response({ error: 'Flock prayer not found' }).code(404);
        }
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Delete a flock prayer (leader only)',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // DELETE /flocks/members/{flockId} - Unfollow a leader
  // ============================================
  {
    method: 'DELETE',
    path: '/flocks/members/{flockId}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { flockId } = request.params;

        await FlockService.leaveFlock(flockId, authUser.id);

        return h.response({
          success: true,
          message: 'Unfollowed successfully'
        }).code(200);
      } catch (error: any) {
        console.error('Leave flock error:', error);
        if (error.message.includes('not found')) {
          return h.response({ error: 'Membership not found' }).code(404);
        }
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          flockId: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Unfollow a leader (leave their flock)',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // POST /flocks/prayer-requests - Member shares pray-on-its with leaders
  // ============================================
  {
    method: 'POST',
    path: '/flocks/prayer-requests',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { items } = request.payload as {
          items: Array<{ name: string; category?: string; prayerFocus?: string; notes?: string }>;
        };

        const results = await FlockService.sharePrayerRequests(
          authUser.id,
          authUser.name,
          items
        );

        return h.response({
          success: true,
          shared: results.length,
        }).code(201);
      } catch (error: any) {
        console.error('Share prayer requests error:', error);
        if (error.message.includes('not a member')) {
          return h.response({ error: error.message }).code(404);
        }
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          items: Joi.array().items(Joi.object({
            name: Joi.string().required().max(255),
            category: Joi.string().optional().allow('', null),
            prayerFocus: Joi.string().optional().allow('', null),
            notes: Joi.string().optional().allow('', null),
          })).min(1).required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Member shares pray-on-it items with their flock leaders',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // GET /flocks/prayer-requests - Leader gets prayer requests from members
  // ============================================
  {
    method: 'GET',
    path: '/flocks/prayer-requests',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;

        const requests = await FlockService.getPrayerRequests(authUser.id);

        return h.response({
          requests,
          count: requests.length,
        }).code(200);
      } catch (error: any) {
        console.error('Get prayer requests error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Get prayer requests shared by flock members',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // PATCH /flocks/prayer-requests/{id} - Approve or deny a prayer request
  // ============================================
  {
    method: 'PATCH',
    path: '/flocks/prayer-requests/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;
        const { action } = request.payload as { action: 'approve' | 'deny' };

        if (action === 'approve') {
          // 1. Mark request as approved and get its data
          const prayerRequest = await FlockService.approvePrayerRequest(id, authUser.id);

          // 2. Add to leader's pray-on-it list (NOT a flock prayer)
          const category = (prayerRequest.category as PrayOnItCategory) || 'other';
          const prayOnItItem = await PrayOnItService.createItem({
            userId: authUser.id,
            name: prayerRequest.name,
            category,
            prayerFocus: prayerRequest.prayerFocus || undefined,
            notes: prayerRequest.notes || undefined,
          });

          return h.response({ success: true, prayOnItItem }).code(200);
        } else {
          // Deny: just update the status
          await FlockService.denyPrayerRequest(id, authUser.id);
          return h.response({ success: true }).code(200);
        }
      } catch (error: any) {
        console.error('Approve/deny prayer request error:', error);
        if (error.message.includes('not found')) {
          return h.response({ error: 'Prayer request not found' }).code(404);
        }
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        payload: Joi.object({
          action: Joi.string().valid('approve', 'deny').required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Approve or deny a prayer request from a flock member',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // DELETE /flocks/prayer-requests/{id} - Leader dismisses a prayer request
  // ============================================
  {
    method: 'DELETE',
    path: '/flocks/prayer-requests/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;

        await FlockService.deletePrayerRequest(id, authUser.id);

        return h.response({ success: true }).code(200);
      } catch (error: any) {
        console.error('Delete prayer request error:', error);
        if (error.message.includes('not found')) {
          return h.response({ error: 'Prayer request not found' }).code(404);
        }
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Leader dismisses a prayer request',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // GET /flocks/qr - Get leader's QR code data
  // ============================================
  {
    method: 'GET',
    path: '/flocks/qr',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;

        const flock = await FlockService.getFlockByLeader(authUser.id);
        if (!flock) {
          return h.response({ error: 'You don\'t have a flock yet' }).code(404);
        }

        return h.response({
          qrCodeIdentifier: flock.qrCodeIdentifier,
          flockName: flock.name,
          leaderName: authUser.name,
        }).code(200);
      } catch (error: any) {
        console.error('Get QR code error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Get the leader\'s QR code identifier for display',
      tags: ['api', 'flocks']
    }
  },

  // ============================================
  // POST /flocks/lookup - Look up flock info by QR code (for join flow)
  // ============================================
  {
    method: 'POST',
    path: '/flocks/lookup',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { qrCodeIdentifier } = request.payload as { qrCodeIdentifier: string };

        const flock = await FlockService.getFlockByQRCode(qrCodeIdentifier);
        if (!flock) {
          return h.response({ error: 'Flock not found' }).code(404);
        }

        return h.response({
          flockName: flock.name,
          requiresAgeVerification: flock.requiresAgeVerification,
          minimumAge: flock.minimumAge,
        }).code(200);
      } catch (error: any) {
        console.error('Flock lookup error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          qrCodeIdentifier: Joi.string().required().trim(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Look up flock info by QR code identifier before joining',
      tags: ['api', 'flocks']
    }
  },
];
