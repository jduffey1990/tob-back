// src/routes/prayOnItRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import Joi from 'joi';
import { PrayOnItService } from '../controllers/prayOnItService';
import { PrayOnItLimitService } from '../controllers/prayOnItLimitService';
import type { UserSafe } from '../models/user';
import { PRAY_ON_IT_CATEGORIES } from '../models/prayOnItItem';

export const prayOnItRoutes: ServerRoute[] = [
  // ============================================
  // GET /pray-on-it - List user's items
  // ============================================
  {
    method: 'GET',
    path: '/pray-on-it',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const items = await PrayOnItService.findUserItems(authUser.id);
        
        return h.response({
          items,
          count: items.length
        }).code(200);
      } catch (error: any) {
        console.error('Get pray-on-it items error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Get all Pray On It items for the authenticated user',
      tags: ['api', 'pray-on-it']
    }
  },

  // ============================================
  // GET /pray-on-it/{id} - Get single item
  // ============================================
  {
    method: 'GET',
    path: '/pray-on-it/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;
        
        const item = await PrayOnItService.findItemById(id, authUser.id);
        
        if (!item) {
          return h.response({ error: 'Pray On It item not found' }).code(404);
        }
        
        return h.response(item).code(200);
      } catch (error: any) {
        console.error('Get pray-on-it item error:', error);
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
      description: 'Get a single Pray On It item by ID',
      tags: ['api', 'pray-on-it']
    }
  },

  // ============================================
  // POST /pray-on-it - Create new item
  // ============================================
  {
    method: 'POST',
    path: '/pray-on-it',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const payload = request.payload as {
          name: string;
          category: string;
          relationship?: string;
          prayerFocus?: string;
          notes?: string;
        };

        // Check item limit BEFORE creating
        try {
          await PrayOnItLimitService.checkCanCreateItem(authUser.id);
        } catch (limitError: any) {
          return h.response({
            error: 'Pray On It item limit reached',
            message: limitError.message,
            upgradeRequired: true
          }).code(402); // 402 Payment Required
        }
        
        // Create the item
        const newItem = await PrayOnItService.createItem({
          userId: authUser.id,
          name: payload.name.trim(),
          category: payload.category as any,
          relationship: payload.relationship?.trim(),
          prayerFocus: payload.prayerFocus?.trim(),
          notes: payload.notes?.trim(),
        });
        
        return h.response(newItem).code(201);
      } catch (error: any) {
        console.error('Create pray-on-it item error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      validate: {
        payload: Joi.object({
          name: Joi.string().required().max(255).trim(),
          category: Joi.string().valid(...PRAY_ON_IT_CATEGORIES).required(),
          relationship: Joi.string().optional().max(100).trim().allow('', null),
          prayerFocus: Joi.string().optional().max(100).trim().allow('', null),
          notes: Joi.string().optional().max(200).trim().allow('', null),
        }),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Create a new Pray On It item (checks tier limits)',
      tags: ['api', 'pray-on-it']
    }
  },

  // ============================================
  // PATCH /pray-on-it/{id} - Update item
  // ============================================
  {
    method: 'PATCH',
    path: '/pray-on-it/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;
        const payload = request.payload as {
          name?: string;
          category?: string;
          relationship?: string;
          prayerFocus?: string;
          notes?: string;
        };

        // Build updates object (trim strings)
        const updates: any = {};
        if (payload.name !== undefined) updates.name = payload.name.trim();
        if (payload.category !== undefined) updates.category = payload.category;
        if (payload.relationship !== undefined) updates.relationship = payload.relationship?.trim() || null;
        if (payload.prayerFocus !== undefined) updates.prayerFocus = payload.prayerFocus?.trim() || null;
        if (payload.notes !== undefined) updates.notes = payload.notes?.trim() || null;
        
        const updatedItem = await PrayOnItService.updateItem(id, authUser.id, updates);
        
        return h.response(updatedItem).code(200);
      } catch (error: any) {
        console.error('Update pray-on-it item error:', error);
        
        if (error.message.includes('not found') || error.message.includes('unauthorized')) {
          return h.response({ error: 'Pray On It item not found' }).code(404);
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
          name: Joi.string().optional().max(255).trim(),
          category: Joi.string().valid(...PRAY_ON_IT_CATEGORIES).optional(),
          relationship: Joi.string().optional().max(100).trim().allow('', null),
          prayerFocus: Joi.string().optional().max(100).trim().allow('', null),
          notes: Joi.string().optional().max(200).trim().allow('', null),
        }).or('name', 'category', 'relationship', 'prayerFocus', 'notes'),
        failAction: async (request, h, err) => { throw err; },
      },
      description: 'Update a Pray On It item (only owner can update)',
      tags: ['api', 'pray-on-it']
    }
  },

  // ============================================
  // DELETE /pray-on-it/{id} - Delete item
  // ============================================
  {
    method: 'DELETE',
    path: '/pray-on-it/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        const { id } = request.params;
        
        await PrayOnItService.deleteItem(id, authUser.id);
        
        return h.response({ 
          success: true,
          message: 'Pray On It item deleted successfully' 
        }).code(200);
      } catch (error: any) {
        console.error('Delete pray-on-it item error:', error);
        
        if (error.message.includes('not found')) {
          return h.response({ error: 'Pray On It item not found' }).code(404);
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
      description: 'Delete a Pray On It item (soft delete)',
      tags: ['api', 'pray-on-it']
    }
  },

  // ============================================
  // GET /pray-on-it/stats - Get user item stats
  // ============================================
  {
    method: 'GET',
    path: '/pray-on-it/stats',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        
        const info = await PrayOnItLimitService.getItemLimitInfo(authUser.id);
        
        return h.response({
          tier: info.tier,
          items: {
            current: info.currentCount,
            limit: info.limit,      // null = unlimited
            remaining: info.remaining, // null = unlimited
            canCreate: info.canCreate
          }
        }).code(200);
      } catch (error: any) {
        console.error('Get pray-on-it stats error:', error);
        return h.response({ error: error.message }).code(500);
      }
    },
    options: { 
      auth: 'jwt',
      description: 'Get Pray On It statistics and limits for current user',
      tags: ['api', 'pray-on-it', 'stats']
    }
  },
];