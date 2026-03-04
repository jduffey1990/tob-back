// src/routes/playlistRoutes.ts

import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';
import { PlaylistService } from '../controllers/playlistService';
import { UserService } from '../controllers/userService';
import type { UserSafe } from '../models/user';

const PLAYLIST_TIERS = ['prayer_warrior', 'lifetime'];

async function requirePlaylistTier(userId: string): Promise<string> {
  const userInfo = await UserService.getUserInfo(userId);
  if (!PLAYLIST_TIERS.includes(userInfo.subscriptionTier)) {
    throw Object.assign(
      new Error('Playlists are available on the Prayer Warrior and Lifetime plans.'),
      { code: 'TIER_REQUIRED' }
    );
  }
  return userInfo.subscriptionTier;
}

export const playlistRoutes: ServerRoute[] = [

  {
    method: 'GET',
    path: '/playlists',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        await requirePlaylistTier(authUser.id);
        const playlists = await PlaylistService.findUserPlaylists(authUser.id);
        return h.response({ playlists, count: playlists.length }).code(200);
      } catch (error: any) {
        if (error.code === 'TIER_REQUIRED') {
          return h.response({ error: error.message, upgradeRequired: true }).code(403);
        }
        console.error('❌ [playlistRoutes] GET /playlists error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'List all playlists for the authed user',
      notes: 'Requires prayer_warrior or lifetime tier',
      tags: ['api', 'playlists'],
    },
  },

  {
    method: 'POST',
    path: '/playlists',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        await requirePlaylistTier(authUser.id);

        const payload = request.payload as { name: string; prayerIds: string[] };

        if (!payload.name || payload.name.trim().length === 0) {
          return h.response({ error: 'name is required' }).code(400);
        }
        if (payload.name.trim().length > 255) {
          return h.response({ error: 'name must be 255 characters or less' }).code(400);
        }
        if (!Array.isArray(payload.prayerIds) || payload.prayerIds.length === 0) {
          return h.response({ error: 'prayerIds must be a non-empty array' }).code(400);
        }

        const playlist = await PlaylistService.createPlaylist({
          userId: authUser.id,
          name: payload.name.trim(),
          prayerIds: payload.prayerIds,
        });

        return h.response(playlist).code(201);
      } catch (error: any) {
        if (error.code === 'TIER_REQUIRED') {
          return h.response({ error: error.message, upgradeRequired: true }).code(403);
        }
        console.error('❌ [playlistRoutes] POST /playlists error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Create a new playlist',
      notes: 'Requires prayer_warrior or lifetime tier. prayerIds array order defines playback position.',
      tags: ['api', 'playlists'],
    },
  },

  // ============================================
  // GET /playlists/{id} — Playlist detail with per-prayer audio state
  // voiceId is now OPTIONAL. When omitted (e.g. Apple TTS client),
  // all prayers are returned with audioState "MISSING" — the iOS
  // client handles playback entirely on-device for Apple voices.
  // ============================================
  {
    method: 'GET',
    path: '/playlists/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        await requirePlaylistTier(authUser.id);

        const { id: playlistId } = request.params;
        // voiceId is optional — absent means Apple TTS (client-side voice)
        const { voiceId } = request.query as { voiceId?: string };

        const detail = await PlaylistService.findPlaylistDetail(
          playlistId,
          authUser.id,
          voiceId   // may be undefined
        );

        if (!detail) {
          return h.response({ error: 'Playlist not found' }).code(404);
        }

        return h.response(detail).code(200);
      } catch (error: any) {
        if (error.code === 'TIER_REQUIRED') {
          return h.response({ error: error.message, upgradeRequired: true }).code(403);
        }
        console.error('❌ [playlistRoutes] GET /playlists/:id error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Get full playlist detail with per-prayer audio state',
      notes: 'voiceId query param optional. Omit for Apple TTS — prayers returned with audioState MISSING.',
      tags: ['api', 'playlists'],
    },
  },

  {
    method: 'PUT',
    path: '/playlists/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        await requirePlaylistTier(authUser.id);

        const { id: playlistId } = request.params;
        const payload = request.payload as { name?: string; prayerIds?: string[] };

        if (payload.name === undefined && payload.prayerIds === undefined) {
          return h.response({ error: 'Provide at least one of: name, prayerIds' }).code(400);
        }
        if (payload.name !== undefined && payload.name.trim().length === 0) {
          return h.response({ error: 'name cannot be empty' }).code(400);
        }
        if (payload.name !== undefined && payload.name.trim().length > 255) {
          return h.response({ error: 'name must be 255 characters or less' }).code(400);
        }
        if (payload.prayerIds !== undefined && !Array.isArray(payload.prayerIds)) {
          return h.response({ error: 'prayerIds must be an array' }).code(400);
        }

        const updated = await PlaylistService.updatePlaylist(
          playlistId,
          authUser.id,
          { name: payload.name?.trim(), prayerIds: payload.prayerIds }
        );

        if (!updated) {
          return h.response({ error: 'Playlist not found' }).code(404);
        }

        return h.response(updated).code(200);
      } catch (error: any) {
        if (error.code === 'TIER_REQUIRED') {
          return h.response({ error: error.message, upgradeRequired: true }).code(403);
        }
        console.error('❌ [playlistRoutes] PUT /playlists/:id error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Update a playlist name and/or ordered prayer list',
      notes: 'prayerIds is a full replacement — position is derived from array index.',
      tags: ['api', 'playlists'],
    },
  },

  {
    method: 'DELETE',
    path: '/playlists/{id}',
    handler: async (request: Request, h: ResponseToolkit) => {
      try {
        const authUser = request.auth.credentials as UserSafe;
        await requirePlaylistTier(authUser.id);

        const { id: playlistId } = request.params;
        const deleted = await PlaylistService.deletePlaylist(playlistId, authUser.id);

        if (!deleted) {
          return h.response({ error: 'Playlist not found' }).code(404);
        }

        return h.response({ message: 'Playlist deleted' }).code(200);
      } catch (error: any) {
        if (error.code === 'TIER_REQUIRED') {
          return h.response({ error: error.message, upgradeRequired: true }).code(403);
        }
        console.error('❌ [playlistRoutes] DELETE /playlists/:id error:', error);
        return h.response({ error: 'Internal server error', message: error.message }).code(500);
      }
    },
    options: {
      auth: 'jwt',
      description: 'Delete a playlist',
      tags: ['api', 'playlists'],
    },
  },
];