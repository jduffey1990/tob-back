// src/routes/audioRoutes.ts
// Audio routes for TTS state management and generation

import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import { AudioService } from '../controllers/audioService';
import type { UserSafe } from '../models/user';

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
        // pinned voice; the override exists so the picker menu can probe a
        // non-pinned voice. Old clients that still pass the user's selectedVoiceId
        // continue to work unchanged.
        const effectiveVoiceId = voiceIdOverride ?? prayer.voiceId;
        if (!effectiveVoiceId) {
          return h.response({
            error: 'Prayer has no pinned voice and no voiceId override was provided'
          }).code(400);
        }

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

        // voiceId optional — defaults to the pinned voice. Pass an explicit
        // override when the picker menu is regenerating into a non-pinned voice.
        const effectiveVoiceId = payload.voiceId ?? prayer.voiceId;
        if (!effectiveVoiceId) {
          return h.response({
            error: 'Prayer has no pinned voice and no voiceId override was provided'
          }).code(400);
        }

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
  }
];