// src/routes/ttsRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { TTSService } from '../controllers/ttsService';
import type { UserSafe } from '../models/user';
import { UserService } from '../controllers/userService';
import { PrayerService } from '../controllers/prayerService';

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
        
        // Get user's subscription tier from database
        const userInfo = await UserService.getUserInfo(authUser.id);
        
        // Get all voices available to this user's tier
        const availableVoices = TTSService.getVoicesForTier(userInfo.subscriptionTier);
        
        // Get ALL voices (to show locked ones in UI)
        const allVoices = TTSService.getAvailableVoices();
        
        return h.response({
          userTier: userInfo.subscriptionTier,
          availableVoices,
          allVoices,
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
  // POST /prayers/{id}/generate-audio - Generate TTS audio
  // ============================================
  {
    method: 'POST',
    path: '/prayers/{id}/generate-audio',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id: prayerId } = request.params;
        const payload = request.payload as {
          voiceId: string;
        };
        
        // Validate payload
        if (!payload.voiceId) {
          return h.response({
            error: 'voiceId is required'
          }).code(400);
        }
        
        // 1. Get the prayer (verify user owns it)
        const prayer = await PrayerService.findPrayerById(prayerId, authUser.id);
        
        if (!prayer) {
          return h.response({ error: 'Prayer not found' }).code(404);
        }
        
        // 2. Generate audio
        const ttsResponse = await TTSService.generateAudio({
          prayerId,
          text: prayer.text,
          voiceId: payload.voiceId,
          userId: authUser.id
        });
        
        // 3. Return audio data
        return h.response(ttsResponse).code(200);
        
      } catch (error: any) {
        console.error('Generate audio error:', error);
        
        // Handle specific errors
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
          }).code(403); // 403 Forbidden
        }
        
        if (error.message.includes('not found')) {
          return h.response({ error: 'Prayer not found' }).code(404);
        }
        
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Generate TTS audio for a prayer',
      tags: ['api', 'tts', 'prayers']
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
        
        const voice = TTSService.getVoiceById(voiceId);
        
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
      description: 'Get preview information for a specific voice',
      tags: ['api', 'tts', 'voices']
    }
  }
];