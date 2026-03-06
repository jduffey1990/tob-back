// src/routes/prayerRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
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
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
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
        const { title, text, category } = request.payload as {
          title: string;
          text: string;
          category?: string;
        };

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
          title: title.trim(),
          text: text.trim(),
          category: category?.trim() || undefined,
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
      validate: {
        payload: Joi.object({
          title: Joi.string().required().max(255).trim(),
          text: Joi.string().required().trim(),
          category: Joi.string().optional().trim().allow('', null),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
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
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        payload: Joi.object({
          title: Joi.string().optional().max(255).trim(),
          text: Joi.string().optional().trim(),
          category: Joi.string().optional().trim().allow('', null),
        }).or('title', 'text', 'category'),
        failAction: async (request, h, err) => { throw err; },
      },
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
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
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
      validate: {
        params: Joi.object({
          id: Joi.string().uuid().required(),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
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
      
      // Get prayer limits
      const prayerInfo = await PrayerLimitService.getSubscriptionInfo(authUser.id);
      
      // Get AI generation credits - use the checkCanGenerate method to get current state
      const aiCheck = await AIService.checkCanGenerate(authUser.id);
      
      return h.response({
        tier: prayerInfo.tier,
        isActive: prayerInfo.isActive,
        expiresAt: prayerInfo.expiresAt,
        prayers: {
          current: prayerInfo.prayerCount,
          limit: prayerInfo.prayerLimit,      // null = unlimited
          remaining: prayerInfo.remainingPrayers, // null = unlimited
          canCreate: prayerInfo.canCreatePrayer
        },
        aiGenerations: {
          current: aiCheck.current,
          limit: aiCheck.limit,               // null = unlimited
          remaining: aiCheck.limit === null 
            ? null 
            : Math.max(0, aiCheck.limit - aiCheck.current),
          canGenerate: aiCheck.allowed,
          period: aiCheck.period              // 'daily' or 'monthly'
        }
      }).code(200);
    } catch (error: any) {
      console.error('Get prayer stats error:', error);
      return h.response({ error: error.message }).code(500);
    }
  },
  options: { 
    auth: 'jwt',
    description: 'Get prayer statistics, limits, and AI generation credits for current user',
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

        const hasPrayOnItItems =
          Array.isArray(payload.prayOnItItems) && payload.prayOnItItems.length > 0;

        const hasCustomContext =
          typeof payload.customContext === 'string' &&
          payload.customContext.trim().length > 0;

        if (!hasPrayOnItItems && !hasCustomContext) {
          return h.response({
            error: 'Please add at least one Pray On It item or provide custom context.'
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
      validate: {
        payload: Joi.object({
          prayerType: Joi.string().valid('gratitude', 'intercession', 'petition', 'confession', 'praise').required(),
          tone: Joi.string().valid('formal', 'conversational', 'contemplative', 'joyful').required(),
          length: Joi.string().valid('brief', 'standard', 'extended').required(),
          prayOnItItems: Joi.array().items(Joi.object({
            id: Joi.string().uuid().required(),
            name: Joi.string().required(),
            category: Joi.string().required(),
            relationship: Joi.string().optional().allow(null, ''),
            prayerFocus: Joi.string().optional().allow(null, ''),
            notes: Joi.string().optional().allow(null, ''),
          })).optional(),
          customContext: Joi.string().optional().allow(null, ''),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Generate a prayer using AI based on Pray On It items and preferences',
      tags: ['api', 'prayers', 'ai']
    }
  },
];