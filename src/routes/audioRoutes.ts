// src/routes/audioRoutes.ts
// Audio routes for TTS state management and generation

import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
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
        const { voiceId } = request.query as { voiceId?: string };
        
        // Validate voiceId is provided
        if (!voiceId) {
          return h.response({
            error: 'voiceId query parameter is required'
          }).code(400);
        }
        
        // Verify user owns this prayer
        const prayer = await AudioService.getPrayerForUser(prayerId, authUser.id);
        
        if (!prayer) {
          return h.response({
            error: 'Prayer not found'
          }).code(404);
        }
        
        // Get audio state
        const state = await AudioService.getAudioState(prayerId, voiceId);
        
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
      description: 'Get audio state for a prayer with specific voice',
      notes: 'Returns BUILDING, READY, or MISSING state',
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
        const payload = request.payload as { voiceId: string };
        
        // Validate payload
        if (!payload.voiceId) {
          return h.response({
            error: 'voiceId is required'
          }).code(400);
        }
        
        console.log("here is id", prayerId)
        // Verify user owns this prayer
        const prayer = await AudioService.getPrayerForUser(prayerId, authUser.id);
        
        if (!prayer) {
          return h.response({
            error: 'Prayer not found'
          }).code(404);
        }
        
        // Check current state
        const currentState = await AudioService.getAudioState(prayerId, payload.voiceId);
        
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
        console.log(`   Voice: ${payload.voiceId}`);
        console.log(`   Text length: ${prayer.text.length} chars`);
        
        // Fire and forget - generation happens in background
        AudioService.generateInBackground(
          prayerId,
          prayer.text,
          payload.voiceId,
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
      description: 'Generate TTS audio for a prayer asynchronously',
      notes: 'Returns 202 if queued, 200 if already exists',
      tags: ['api', 'audio', 'prayers']
    }
  }
];