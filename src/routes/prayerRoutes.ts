// src/routes/prayerRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { PrayerService } from '../controllers/prayerService';
import { PrayerLimitService } from '../controllers/prayerLimitService';
import { AIService } from '../controllers/aiService'
import type { UserSafe } from '../models/user';
import { PrayerGenerationRequest } from '../models/aiItems';

export const prayerRoutes: ServerRoute[] = [
  // ============================================
  // GET /prayers - List user's prayers
  // ============================================
  {
    method: 'GET',
    path: '/prayers',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const prayers = await PrayerService.findUserPrayers(authUser.id);
        
        return h.response({
          prayers,
          count: prayers.length
        }).code(200);
      } catch (error: any) {
        console.error('Get prayers error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Get all prayers for the authenticated user',
      tags: ['api', 'prayers']
    }
  },

  // ============================================
  // GET /prayers/{id} - Get single prayer
  // ============================================
  {
    method: 'GET',
    path: '/prayers/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;
        
        const prayer = await PrayerService.findPrayerById(id, authUser.id);
        
        if (!prayer) {
          return h.response({ error: 'Prayer not found' }).code(404);
        }
        
        return h.response(prayer).code(200);
      } catch (error: any) {
        console.error('Get prayer error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Get a single prayer by ID',
      tags: ['api', 'prayers']
    }
  },

  // ============================================
  // POST /prayers - Create new prayer
  // ============================================
  {
    method: 'POST',
    path: '/prayers',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const payload = request.payload as {
          title: string;
          text: string;
          category?: string;
        };
        
        // Validate required fields
        if (!payload.title || !payload.text) {
          return h.response({ 
            error: 'title and text are required' 
          }).code(400);
        }
        
        // Validate title length
        if (payload.title.length > 255) {
          return h.response({ 
            error: 'title must be 255 characters or less' 
          }).code(400);
        }
        
        // Check prayer limit BEFORE creating
        try {
          await PrayerLimitService.checkCanCreatePrayer(authUser.id);
        } catch (limitError: any) {
          // User hit their limit
          return h.response({
            error: 'Prayer limit reached',
            message: limitError.message,
            upgradeRequired: true
          }).code(402); // 402 Payment Required
        }
        
        // Create the prayer
        const newPrayer = await PrayerService.createPrayer({
          userId: authUser.id,
          title: payload.title.trim(),
          text: payload.text.trim(),
          category: payload.category?.trim() || undefined,
          isTemplate: false
        });
        
        return h.response(newPrayer).code(201);
      } catch (error: any) {
        console.error('Create prayer error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Create a new prayer (checks tier limits)',
      tags: ['api', 'prayers']
    }
  },

  // ============================================
  // PATCH /prayers/{id} - Update prayer
  // ============================================
  {
    method: 'PATCH',
    path: '/prayers/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;
        const payload = request.payload as {
          title?: string;
          text?: string;
          category?: string;
        };
        
        // Validate: at least one field to update
        if (!payload.title && !payload.text && payload.category === undefined) {
          return h.response({ 
            error: 'At least one field (title, text, or category) is required' 
          }).code(400);
        }
        
        // Validate title length if provided
        if (payload.title && payload.title.length > 255) {
          return h.response({ 
            error: 'title must be 255 characters or less' 
          }).code(400);
        }
        
        // Build updates object (trim strings)
        const updates: any = {};
        if (payload.title !== undefined) updates.title = payload.title.trim();
        if (payload.text !== undefined) updates.text = payload.text.trim();
        if (payload.category !== undefined) updates.category = payload.category?.trim() || null;
        
        const updatedPrayer = await PrayerService.updatePrayer(id, authUser.id, updates);
        
        return h.response(updatedPrayer).code(200);
      } catch (error: any) {
        console.error('Update prayer error:', error);
        
        if (error.message.includes('not found') || error.message.includes('unauthorized')) {
          return h.response({ error: 'Prayer not found' }).code(404);
        }
        
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Update a prayer (only owner can update)',
      tags: ['api', 'prayers']
    }
  },

  // ============================================
  // DELETE /prayers/{id} - Delete prayer
  // ============================================
  {
    method: 'DELETE',
    path: '/prayers/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;
        
        await PrayerService.deletePrayer(id, authUser.id);
        
        return h.response({ 
          success: true,
          message: 'Prayer deleted successfully' 
        }).code(200);
      } catch (error: any) {
        console.error('Delete prayer error:', error);
        
        if (error.message.includes('not found')) {
          return h.response({ error: 'Prayer not found' }).code(404);
        }
        
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Delete a prayer (soft delete)',
      tags: ['api', 'prayers']
    }
  },

  // ============================================
  // POST /prayers/{id}/play - Record playback
  // ============================================
  {
    method: 'POST',
    path: '/prayers/{id}/play',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;
        
        const updatedPrayer = await PrayerService.recordPlayback(id, authUser.id);
        
        return h.response(updatedPrayer).code(200);
      } catch (error: any) {
        console.error('Record playback error:', error);
        
        if (error.message.includes('not found')) {
          return h.response({ error: 'Prayer not found' }).code(404);
        }
        
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Record that a prayer was played (increments play_count)',
      tags: ['api', 'prayers']
    }
  },

  // ============================================
  // GET /prayer-templates - Get template library
  // ============================================
  {
    method: 'GET',
    path: '/prayer-templates',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const templates = await PrayerService.getPrayerTemplates();
        
        return h.response({
          templates,
          count: templates.length
        }).code(200);
      } catch (error: any) {
        console.error('Get templates error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: false, // Templates are public
      description: 'Get pre-built prayer templates (public)',
      tags: ['api', 'prayers', 'templates']
    }
  },

  // ============================================
  // GET /prayers/stats - Get user prayer stats
  // ============================================
  {
    method: 'GET',
    path: '/prayers/stats',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        
        // Get comprehensive subscription info
        const info = await PrayerLimitService.getSubscriptionInfo(authUser.id);
        
        return h.response({
          tier: info.tier,
          isActive: info.isActive,
          expiresAt: info.expiresAt,
          prayers: {
            current: info.prayerCount,
            limit: info.prayerLimit,      // null = unlimited
            remaining: info.remainingPrayers, // null = unlimited
            canCreate: info.canCreatePrayer
          }
        }).code(200);
      } catch (error: any) {
        console.error('Get prayer stats error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Get prayer statistics and limits for current user',
      tags: ['api', 'prayers', 'stats']
    }
  },

    // ============================================
  // POST AI prayers build
  // ============================================
  {
    method: 'POST',
    path: '/prayers/ai-gen',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const payload = request.payload as PrayerGenerationRequest;
        
        // Validate required fields
        if (!payload.prayerType || !payload.tone || !payload.length || !payload.expansiveness) {
          return h.response({ 
            error: 'Missing required fields: prayerType, tone, length, expansiveness' 
          }).code(400);
        }
        
        if (!payload.prayOnItItems || payload.prayOnItItems.length === 0) {
          return h.response({ 
            error: 'At least one Pray On It item is required' 
          }).code(400);
        }
        
        console.log(`🔵 [Route] Generating AI prayer for user ${authUser.id}`);
        
        // Call the AIService
        const generationResponse = await AIService.generatePrayer(authUser.id, payload);
        
        console.log("✅ [Route] AI prayer generated successfully");
        
        // Return the response (matches PrayerGenerationResponse interface)
        return h.response(generationResponse).code(200);
        
      } catch (error: any) {
        console.error('❌ [Route] AI generation error:', error);
        
        // Handle specific error types
        if (error.message.includes('LIMIT_REACHED')) {
          const message = error.message.replace('LIMIT_REACHED: ', '');
          return h.response({
            error: 'AI generation limit reached',
            message: message,
            upgradeRequired: true
          }).code(402); // Payment Required
        }
        
        if (error.message.includes('AI_ERROR')) {
          const message = error.message.replace('AI_ERROR: ', '');
          return h.response({
            error: 'AI service error',
            message: message
          }).code(503); // Service Unavailable
        }
        
        // Generic error
        return h.response({ 
          error: error.message || 'Failed to generate prayer' 
        }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Generate a prayer using AI based on Pray On It items and preferences',
      tags: ['api', 'prayers', 'ai']
    }
  },
];