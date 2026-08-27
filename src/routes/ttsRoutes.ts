// src/routes/ttsRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import { TTSService } from '../controllers/ttsService';
import type { UserSafe } from '../models/user';

export const ttsRoutes: ServerRoute[] = [
  // ============================================
  // GET /voices - Get available voices
  // ============================================
  {
    method: 'GET',
    path: '/voices',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const tier = authUser.subscriptionTier;

        // Free users with trial credits see all voices unlocked. Non-free
        // users get a null count and the standard tier filter.
        const trialVoicesRemaining = tier === 'free' ? authUser.trialVoicesRemaining : null;
        const trialActive = trialVoicesRemaining !== null && trialVoicesRemaining > 0;

        const allVoices = await TTSService.getAvailableVoices();
        const availableVoices = trialActive
          ? allVoices
          : allVoices.filter(voice => TTSService.canUserUseVoice(tier, voice));

        return h.response({
          userTier: tier,
          availableVoices,
          allVoices,
          trialVoicesRemaining,
          count: {
            available: availableVoices.length,
            total: allVoices.length
          }
        }).code(200);
      } catch (error: any) {
        console.error('Get voices error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Get available TTS voices based on user tier',
      tags: ['api', 'tts', 'voices']
    }
  },

  // ============================================
  // GET /voices/preview/{voiceId} - Get preview info for a voice
  // ============================================
  {
    method: 'GET',
    path: '/voices/preview/{voiceId}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const { voiceId } = request.params;
        
        const voice = await TTSService.getVoiceById(voiceId);
        
        if (!voice) {
          return h.response({ error: 'Voice not found' }).code(404);
        }
        
        // Return voice details (iOS can use this to show preview)
        return h.response({
          voice,
          previewText: 'The Lord is my shepherd; I shall not want.'
        }).code(200);
        
      } catch (error: any) {
        console.error('Get voice preview error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        params: Joi.object({
          voiceId: Joi.string().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Get preview information for a specific voice',
      tags: ['api', 'tts', 'voices']
    }
  }
];