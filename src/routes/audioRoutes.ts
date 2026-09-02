// src/routes/audioRoutes.ts
// Audio routes for TTS state management and generation

import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import { AudioService } from '../controllers/audioService';
import { PrayerService } from '../controllers/prayerService';
import { TTSService } from '../controllers/ttsService';
import type { UserSafe } from '../models/user';

// Sentinel voice for a prayer recorded in the user's own voice. Deliberately
// NOT a row in the `voices` table — see llm_history/claude_md_my_voice_2026-09-02.md.
export const USER_RECORDING_VOICE_ID = 'user-recording';

export const audioRoutes: ServerRoute[] = [
  
  // ============================================
  // GET /prayers/{id}/audio-state - Check audio state
  // ============================================
  {
    method: 'GET',
    path: '/prayers/{id}/audio-state',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id: prayerId } = request.params;
        const { voiceId: voiceIdOverride } = request.query as { voiceId?: string };

        // Verify user owns this prayer (and grab its pinned voice).
        const prayer = await AudioService.getPrayerForUser(prayerId, authUser.id);

        if (!prayer) {
          return h.response({
            error: 'Prayer not found'
          }).code(404);
        }

        // voiceId is optional. New clients omit it and get audio for the prayer's
        // pinned voice (NOT NULL); the override exists so the picker menu can
        // probe a non-pinned voice. Old clients that still pass the user's
        // selectedVoiceId continue to work unchanged.
        const effectiveVoiceId = voiceIdOverride ?? prayer.voiceId;

        const state = await AudioService.getAudioState(prayerId, effectiveVoiceId);

        return h.response(state).code(200);

      } catch (error: any) {
        console.error('❌ [audioRoutes] Get audio state error:', error);
        return h.response({
          error: 'Internal server error',
          message: error.message
        }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        query: Joi.object({
          voiceId: Joi.string().optional(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Get audio state for a prayer (defaults to its pinned voice)',
      notes: 'voiceId optional — omit to use the prayer\'s pinned voice; pass it to probe a non-pinned voice (picker menu).',
      tags: ['api', 'audio', 'prayers']
    }
  },
  
  // ============================================
  // POST /prayers/{id}/generate-audio - Generate audio asynchronously
  // ============================================
  {
    method: 'POST',
    path: '/prayers/{id}/generate-audio',
    handler: async (request: Request, h: ResponseToolkit) => {
      console.log("called route")
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id: prayerId } = request.params;
        const payload = request.payload as { voiceId?: string };

        console.log("here is id", prayerId)
        // Verify user owns this prayer (and grab its pinned voice).
        const prayer = await AudioService.getPrayerForUser(prayerId, authUser.id);

        if (!prayer) {
          return h.response({
            error: 'Prayer not found'
          }).code(404);
        }

        // voiceId optional — defaults to the pinned voice (NOT NULL). Pass an
        // explicit override when regenerating into a non-pinned voice.
        const effectiveVoiceId = payload.voiceId ?? prayer.voiceId;

        const currentState = await AudioService.getAudioState(prayerId, effectiveVoiceId);

        // ✅ If already exists, return it immediately (cache hit!)
        if (currentState.state === 'READY') {
          console.log(`✅ [audioRoutes] Audio already exists, returning URL`);
          return h.response({
            state: 'READY',
            audioUrl: currentState.audioUrl,
            fileSize: currentState.fileSize,
            duration: currentState.duration,
            message: 'Audio already generated'
          }).code(200);
        }

        // ⏳ If already building, return 202 (idempotent!)
        if (currentState.state === 'BUILDING') {
          console.log(`⏳ [audioRoutes] Audio already building, returning 202`);
          return h.response({
            state: 'BUILDING',
            message: 'Audio generation in progress'
          }).code(202);
        }

        // 🚀 State is MISSING - start async generation
        console.log(`🚀 [audioRoutes] Starting async audio generation`);
        console.log(`   Prayer: ${prayerId} (${prayer.title})`);
        console.log(`   Voice: ${effectiveVoiceId}`);
        console.log(`   Text length: ${prayer.text.length} chars`);

        // Hand off to the worker Lambda via SQS (or run inline in local dev).
        await AudioService.enqueueGeneration(
          prayerId,
          prayer.text,
          effectiveVoiceId,
          authUser.id
        );

        
        // Return 202 Accepted immediately
        return h.response({
          state: 'BUILDING',
          message: 'Audio generation started',
          estimatedTime: '5-10 seconds'
        }).code(202);
        
      } catch (error: any) {
        console.error('❌ [audioRoutes] Generate audio error:', error);
        
        // Handle specific errors from TTSService
        if (error.message.includes('INVALID_VOICE')) {
          return h.response({
            error: 'Invalid voice ID',
            message: error.message
          }).code(400);
        }
        
        if (error.message.includes('INVALID_TIER')) {
          return h.response({
            error: 'Voice not available in your subscription tier',
            message: error.message,
            upgradeRequired: true
          }).code(403);
        }
        
        if (error.message.includes('ALREADY_BUILDING')) {
          return h.response({
            state: 'BUILDING',
            message: 'Audio generation already in progress'
          }).code(202);
        }
        
        return h.response({
          error: 'Internal server error',
          message: error.message
        }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        payload: Joi.object({
          voiceId: Joi.string().optional(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Generate TTS audio for a prayer asynchronously',
      notes: 'Returns 202 if queued, 200 if already exists',
      tags: ['api', 'audio', 'prayers']
    }
  },

  // ============================================
  // PUT /prayers/{id}/voice - Repin a prayer's playback voice
  // ============================================
  {
    method: 'PUT',
    path: '/prayers/{id}/voice',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id: prayerId } = request.params;
        const { voiceId } = request.payload as { voiceId: string };

        const prayer = await AudioService.getPrayerForUser(prayerId, authUser.id);
        if (!prayer) {
          return h.response({ error: 'Prayer not found' }).code(404);
        }

        // Flock prayers serve one shared audio per prayer — a repin would
        // change what every member hears. Personal prayers only.
        if (prayer.flockId) {
          return h.response({
            error: 'Flock prayer voices cannot be changed'
          }).code(403);
        }

        // My Voice has no `voices` row — getVoiceById would 400 it below.
        // Repin unconditionally and report whether a recording already
        // exists (READY) or the client needs to open the recorder (MISSING).
        if (voiceId === USER_RECORDING_VOICE_ID) {
          await PrayerService.updatePrayer(prayerId, authUser.id, { voiceId });
          const currentState = await AudioService.getAudioState(prayerId, voiceId);
          const audioState = currentState.state === 'READY' ? 'READY' : 'MISSING';

          return h.response({
            voiceId,
            audioState,
            ...(audioState === 'READY' ? { audioUrl: currentState.audioUrl } : {}),
            trialCreditConsumed: false
          }).code(200);
        }

        const voice = await TTSService.getVoiceById(voiceId);
        if (!voice) {
          return h.response({
            error: 'Invalid voice ID',
            message: `Voice ${voiceId} not found`
          }).code(400);
        }

        // Apple voices synthesize on-device — nothing to generate, pin and go.
        if (voice.provider === 'apple') {
          await PrayerService.updatePrayer(prayerId, authUser.id, { voiceId });
          return h.response({
            voiceId,
            audioState: 'ON_DEVICE',
            trialCreditConsumed: false
          }).code(200);
        }

        const currentState = await AudioService.getAudioState(prayerId, voiceId);

        // Cached audio repins free regardless of tier: the spend already
        // happened, replay costs nothing. Only a fresh generation is gated.
        if (currentState.state === 'READY') {
          await PrayerService.updatePrayer(prayerId, authUser.id, { voiceId });
          return h.response({
            voiceId,
            audioState: 'READY',
            audioUrl: currentState.audioUrl,
            trialCreditConsumed: false
          }).code(200);
        }

        // Already building (e.g. picker probe raced a creation enqueue):
        // whoever enqueued it passed the gate — pin and report progress.
        if (currentState.state === 'BUILDING') {
          await PrayerService.updatePrayer(prayerId, authUser.id, { voiceId });
          return h.response({
            voiceId,
            audioState: 'BUILDING',
            trialCreditConsumed: false
          }).code(202);
        }

        // MISSING: run the TTS pathway. enqueueGeneration is the single
        // chokepoint for tier gating + trial-credit consumption; call it
        // BEFORE pinning so a rejected voice never sticks to the prayer.
        // Read the credit posture first so the response can say whether
        // this call consumed one.
        const { consumesTrialCredit } = await TTSService.canUserUseVoiceWithTrial(
          authUser.id, authUser.subscriptionTier, voice
        );

        await AudioService.enqueueGeneration(prayerId, prayer.text, voiceId, authUser.id);
        await PrayerService.updatePrayer(prayerId, authUser.id, { voiceId });

        const trialVoicesRemaining = await TTSService.getTrialVoicesRemaining(authUser.id);

        return h.response({
          voiceId,
          audioState: 'BUILDING',
          trialCreditConsumed: consumesTrialCredit,
          trialVoicesRemaining
        }).code(202);

      } catch (error: any) {
        console.error('❌ [audioRoutes] Repin voice error:', error);

        if (error.message.includes('requires') || error.message.includes('INVALID_TIER')) {
          return h.response({
            error: 'Voice not available in your subscription tier',
            message: error.message,
            upgradeRequired: true
          }).code(403);
        }

        if (error.message.includes('already in progress') || error.message.includes('ALREADY_BUILDING')) {
          return h.response({
            voiceId: (request.payload as { voiceId: string }).voiceId,
            audioState: 'BUILDING',
            trialCreditConsumed: false
          }).code(202);
        }

        if (error.message.includes('not found')) {
          return h.response({
            error: 'Invalid voice ID',
            message: error.message
          }).code(400);
        }

        return h.response({
          error: 'Internal server error',
          message: error.message
        }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        payload: Joi.object({
          voiceId: Joi.string().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Repin a personal prayer\'s playback voice',
      notes: 'Cached voices repin instantly and free; uncached server voices run the TTS pathway (tier gate + trial credit). Flock prayers are rejected.',
      tags: ['api', 'audio', 'prayers']
    }
  },

  // ============================================
  // POST /prayers/{id}/recording - Upload a user's own voice recording
  // ============================================
  {
    method: 'POST',
    path: '/prayers/{id}/recording',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id: prayerId } = request.params;

        const prayer = await AudioService.getPrayerForUser(prayerId, authUser.id);
        if (!prayer) {
          return h.response({
            error: 'Prayer not found'
          }).code(404);
        }

        const audioBuffer = request.payload as Buffer;

        // Sniff the ftyp box rather than trusting the declared Content-Type —
        // refuse anything that isn't M4A/AAC before it reaches S3.
        const isM4A = audioBuffer.length >= 8 && audioBuffer.toString('ascii', 4, 8) === 'ftyp';
        if (!isM4A) {
          return h.response({
            error: 'Unsupported audio format',
            message: 'Expected an M4A/AAC recording'
          }).code(415);
        }

        const { audioUrl } = await AudioService.saveUserRecording(
          prayerId, USER_RECORDING_VOICE_ID, audioBuffer
        );

        // Pin regardless of the prayer's current voice — covers both a fresh
        // My Voice creation and a re-record after the prayer had drifted to
        // another voice.
        await PrayerService.updatePrayer(prayerId, authUser.id, { voiceId: USER_RECORDING_VOICE_ID });

        return h.response({
          state: 'READY',
          audioUrl
        }).code(200);

      } catch (error: any) {
        console.error('❌ [audioRoutes] Upload recording error:', error);
        return h.response({
          error: 'Internal server error',
          message: error.message
        }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      payload: {
        parse: false,          // hand the handler a raw Buffer
        output: 'data',
        allow: 'audio/mp4',    // M4A/AAC, not audio/mpeg
        maxBytes: 4_500_000    // must equal the client's maxUploadBytes constant
      },
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Upload a user-recorded prayer (M4A/AAC) as its audio',
      notes: 'Pins the prayer to the My Voice sentinel. No TTS, no voices row, upserts on re-record.',
      tags: ['api', 'audio', 'prayers']
    }
  }
];