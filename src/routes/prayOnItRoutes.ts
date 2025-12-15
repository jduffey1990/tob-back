// src/routes/prayOnItRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { PrayOnItService } from '../controllers/prayOnItService';
import { PrayOnItLimitService } from '../controllers/prayOnItLimitService';
import type { UserSafe } from '../models/user';

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
        
        // Validate required fields
        if (!payload.name || !payload.category) {
          return h.response({ 
            error: 'name and category are required' 
          }).code(400);
        }
        
        // Validate name length
        if (payload.name.length > 255) {
          return h.response({ 
            error: 'name must be 255 characters or less' 
          }).code(400);
        }
        
        // Validate category
        const validCategories = ['family', 'friends', 'work', 'health', 'personal', 'world', 'other'];
        if (!validCategories.includes(payload.category)) {
          return h.response({ 
            error: `category must be one of: ${validCategories.join(', ')}` 
          }).code(400);
        }
        
        // Validate optional field lengths
        if (payload.relationship && payload.relationship.length > 100) {
          return h.response({ 
            error: 'relationship must be 100 characters or less' 
          }).code(400);
        }
        
        if (payload.prayerFocus && payload.prayerFocus.length > 100) {
          return h.response({ 
            error: 'prayerFocus must be 100 characters or less' 
          }).code(400);
        }
        
        if (payload.notes && payload.notes.length > 200) {
          return h.response({ 
            error: 'notes must be 200 characters or less' 
          }).code(400);
        }
        
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
        
        // Validate: at least one field to update
        if (!payload.name && !payload.category && 
            payload.relationship === undefined && 
            payload.prayerFocus === undefined && 
            payload.notes === undefined) {
          return h.response({ 
            error: 'At least one field (name, category, relationship, prayerFocus, or notes) is required' 
          }).code(400);
        }
        
        // Validate field lengths if provided
        if (payload.name && payload.name.length > 255) {
          return h.response({ 
            error: 'name must be 255 characters or less' 
          }).code(400);
        }
        
        if (payload.relationship && payload.relationship.length > 100) {
          return h.response({ 
            error: 'relationship must be 100 characters or less' 
          }).code(400);
        }
        
        if (payload.prayerFocus && payload.prayerFocus.length > 100) {
          return h.response({ 
            error: 'prayerFocus must be 100 characters or less' 
          }).code(400);
        }
        
        if (payload.notes && payload.notes.length > 200) {
          return h.response({ 
            error: 'notes must be 200 characters or less' 
          }).code(400);
        }
        
        // Validate category if provided
        if (payload.category) {
          const validCategories = ['family', 'friends', 'work', 'health', 'personal', 'world', 'other'];
          if (!validCategories.includes(payload.category)) {
            return h.response({ 
              error: `category must be one of: ${validCategories.join(', ')}` 
            }).code(400);
          }
        }
        
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