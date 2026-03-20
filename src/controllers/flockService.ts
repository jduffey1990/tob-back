// src/controllers/flockService.ts
import { PostgresService } from './postgres.service';
import { NotFoundError, ForbiddenError, ConflictError } from '../errors';
import {
  Flock,
  FlockWithStats,
  FlockMember,
  FlockPrayer,
  FlockPrayerWithLeader,
  CreateFlockInput,
  CreateFlockPrayerInput,
  FollowedLeader,
  FlockPrayerRequest,
} from '../models/flock';
import crypto from 'crypto';

// Map db row -> Flock
function mapRowToFlock(row: any): Flock {
  return {
    id: row.id,
    leaderUserId: row.leader_user_id,
    name: row.name,
    qrCodeIdentifier: row.qr_code_identifier,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map db row -> FlockPrayer
function mapRowToFlockPrayer(row: any): FlockPrayer {
  return {
    id: row.id,
    flockId: row.flock_id,
    createdBy: row.created_by,
    title: row.title,
    text: row.text,
    audioUrl: row.audio_url ?? null,
    voiceId: row.voice_id ?? null,
    voiceName: row.voice_name ?? null,
    provider: row.provider ?? null,
    listenCount: row.listen_count,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Map db row -> FlockPrayerWithLeader (for feed queries)
function mapRowToFlockPrayerWithLeader(row: any): FlockPrayerWithLeader {
  return {
    ...mapRowToFlockPrayer(row),
    leaderName: row.leader_name,
    flockName: row.flock_name,
  };
}

export class FlockService {

  // ===========================
  // Flock CRUD
  // ===========================

  /**
   * Create a flock for a leader. One flock per leader.
   */
  public static async createFlock(input: CreateFlockInput): Promise<Flock> {
    const db = PostgresService.getInstance();

    // Generate a unique QR code identifier
    const qrCodeIdentifier = crypto.randomUUID();

    const { rows } = await db.query(
      `INSERT INTO flocks (leader_user_id, name, qr_code_identifier)
       VALUES ($1::uuid, $2, $3)
       RETURNING id, leader_user_id, name, qr_code_identifier, created_at, updated_at`,
      [input.leaderUserId, input.name, qrCodeIdentifier]
    );

    return mapRowToFlock(rows[0]);
  }

  /**
   * Get a leader's flock with follower/prayer counts
   */
  public static async getFlockByLeader(leaderUserId: string): Promise<FlockWithStats | null> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT f.id, f.leader_user_id, f.name, f.qr_code_identifier,
              f.created_at, f.updated_at,
              (SELECT COUNT(*) FROM flock_members fm WHERE fm.flock_id = f.id) AS follower_count,
              (SELECT COUNT(*) FROM flock_prayers fp WHERE fp.flock_id = f.id) AS published_prayer_count
       FROM flocks f
       WHERE f.leader_user_id = $1::uuid
       LIMIT 1`,
      [leaderUserId]
    );

    if (!rows[0]) return null;

    return {
      ...mapRowToFlock(rows[0]),
      followerCount: parseInt(rows[0].follower_count),
      publishedPrayerCount: parseInt(rows[0].published_prayer_count),
    };
  }

  /**
   * Get a flock by its QR code identifier (for join flow)
   */
  public static async getFlockByQRCode(qrCodeIdentifier: string): Promise<Flock | null> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT id, leader_user_id, name, qr_code_identifier, created_at, updated_at
       FROM flocks
       WHERE qr_code_identifier = $1
       LIMIT 1`,
      [qrCodeIdentifier]
    );

    return rows[0] ? mapRowToFlock(rows[0]) : null;
  }

  // ===========================
  // Member Management
  // ===========================

  /**
   * Join a flock by QR code identifier
   */
  public static async joinFlock(qrCodeIdentifier: string, memberUserId: string): Promise<FlockMember> {
    const db = PostgresService.getInstance();

    // Find the flock
    const flock = await this.getFlockByQRCode(qrCodeIdentifier);
    if (!flock) {
      throw new NotFoundError('Flock');
    }

    // Can't follow your own flock
    if (flock.leaderUserId === memberUserId) {
      throw new ConflictError('You cannot join your own flock');
    }

    // Check for duplicate
    const { rows: existing } = await db.query(
      `SELECT id FROM flock_members
       WHERE flock_id = $1::uuid AND member_user_id = $2::uuid
       LIMIT 1`,
      [flock.id, memberUserId]
    );

    if (existing.length > 0) {
      throw new ConflictError('You are already following this leader');
    }

    const { rows } = await db.query(
      `INSERT INTO flock_members (flock_id, member_user_id)
       VALUES ($1::uuid, $2::uuid)
       RETURNING id, flock_id, member_user_id, joined_at`,
      [flock.id, memberUserId]
    );

    return {
      id: rows[0].id,
      flockId: rows[0].flock_id,
      memberUserId: rows[0].member_user_id,
      joinedAt: rows[0].joined_at,
    };
  }

  /**
   * Leave a flock (unfollow a leader)
   */
  public static async leaveFlock(flockId: string, memberUserId: string): Promise<void> {
    const db = PostgresService.getInstance();

    const { rowCount } = await db.query(
      `DELETE FROM flock_members
       WHERE flock_id = $1::uuid AND member_user_id = $2::uuid`,
      [flockId, memberUserId]
    );

    if (rowCount === 0) {
      throw new NotFoundError('Flock membership');
    }
  }

  /**
   * Get all leaders a user follows
   */
  public static async getFollowedLeaders(memberUserId: string): Promise<FollowedLeader[]> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT f.id AS flock_id, f.name AS flock_name,
              f.leader_user_id, u.name AS leader_name,
              fm.joined_at
       FROM flock_members fm
       JOIN flocks f ON f.id = fm.flock_id
       JOIN users u ON u.id = f.leader_user_id
       WHERE fm.member_user_id = $1::uuid
       ORDER BY fm.joined_at DESC`,
      [memberUserId]
    );

    return rows.map((row: any) => ({
      flockId: row.flock_id,
      flockName: row.flock_name,
      leaderUserId: row.leader_user_id,
      leaderName: row.leader_name,
      joinedAt: row.joined_at,
    }));
  }

  // ===========================
  // Flock Prayers
  // ===========================

  /**
   * Publish a prayer to a flock
   */
  public static async publishPrayer(input: CreateFlockPrayerInput): Promise<FlockPrayer> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `INSERT INTO flock_prayers (flock_id, created_by, title, text)
       VALUES ($1::uuid, $2::uuid, $3, $4)
       RETURNING id, flock_id, created_by, title, text, audio_url,
                 voice_id, voice_name, provider, listen_count,
                 published_at, created_at, updated_at`,
      [input.flockId, input.createdBy, input.title, input.text]
    );

    return mapRowToFlockPrayer(rows[0]);
  }

  /**
   * Update audio URL on a flock prayer (called after TTS completes)
   */
  public static async updatePrayerAudio(
    prayerId: string,
    audioUrl: string,
    voiceId: string,
    voiceName: string,
    provider: string
  ): Promise<FlockPrayer> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `UPDATE flock_prayers
       SET audio_url = $2, voice_id = $3, voice_name = $4, provider = $5, updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id, flock_id, created_by, title, text, audio_url,
                 voice_id, voice_name, provider, listen_count,
                 published_at, created_at, updated_at`,
      [prayerId, audioUrl, voiceId, voiceName, provider]
    );

    if (!rows[0]) throw new NotFoundError('Flock prayer');
    return mapRowToFlockPrayer(rows[0]);
  }

  /**
   * Get the prayer feed for a member (all prayers from followed leaders)
   */
  public static async getMemberFeed(memberUserId: string): Promise<FlockPrayerWithLeader[]> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT fp.id, fp.flock_id, fp.created_by, fp.title, fp.text,
              fp.audio_url, fp.voice_id, fp.voice_name, fp.provider,
              fp.listen_count, fp.published_at, fp.created_at, fp.updated_at,
              u.name AS leader_name, f.name AS flock_name
       FROM flock_prayers fp
       JOIN flocks f ON f.id = fp.flock_id
       JOIN users u ON u.id = fp.created_by
       WHERE fp.flock_id IN (
         SELECT flock_id FROM flock_members WHERE member_user_id = $1::uuid
       )
       ORDER BY fp.published_at DESC`,
      [memberUserId]
    );

    return rows.map(mapRowToFlockPrayerWithLeader);
  }

  /**
   * Get a single flock prayer by ID
   */
  public static async getFlockPrayerById(prayerId: string): Promise<FlockPrayerWithLeader | null> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT fp.id, fp.flock_id, fp.created_by, fp.title, fp.text,
              fp.audio_url, fp.voice_id, fp.voice_name, fp.provider,
              fp.listen_count, fp.published_at, fp.created_at, fp.updated_at,
              u.name AS leader_name, f.name AS flock_name
       FROM flock_prayers fp
       JOIN flocks f ON f.id = fp.flock_id
       JOIN users u ON u.id = fp.created_by
       WHERE fp.id = $1::uuid
       LIMIT 1`,
      [prayerId]
    );

    return rows[0] ? mapRowToFlockPrayerWithLeader(rows[0]) : null;
  }

  /**
   * Get all prayers published by a leader to their flock
   */
  public static async getLeaderPrayers(leaderUserId: string): Promise<FlockPrayer[]> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT id, flock_id, created_by, title, text, audio_url,
              voice_id, voice_name, provider, listen_count,
              published_at, created_at, updated_at
       FROM flock_prayers
       WHERE created_by = $1::uuid
       ORDER BY published_at DESC`,
      [leaderUserId]
    );

    return rows.map(mapRowToFlockPrayer);
  }

  /**
   * Record a listen on a flock prayer
   */
  public static async recordListen(prayerId: string): Promise<FlockPrayer> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `UPDATE flock_prayers
       SET listen_count = listen_count + 1, updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id, flock_id, created_by, title, text, audio_url,
                 voice_id, voice_name, provider, listen_count,
                 published_at, created_at, updated_at`,
      [prayerId]
    );

    if (!rows[0]) throw new NotFoundError('Flock prayer');
    return mapRowToFlockPrayer(rows[0]);
  }

  /**
   * Delete a flock prayer (leader only)
   */
  public static async deleteFlockPrayer(prayerId: string, leaderUserId: string): Promise<void> {
    const db = PostgresService.getInstance();

    const { rowCount } = await db.query(
      `DELETE FROM flock_prayers
       WHERE id = $1::uuid AND created_by = $2::uuid`,
      [prayerId, leaderUserId]
    );

    if (rowCount === 0) {
      throw new NotFoundError('Flock prayer');
    }
  }

  // ===========================
  // Prayer Requests (member → leader)
  // ===========================

  /**
   * Member shares pray-on-it items with their flock leaders
   */
  public static async sharePrayerRequests(
    memberUserId: string,
    memberName: string,
    items: Array<{ name: string; category?: string; prayerFocus?: string; notes?: string }>
  ): Promise<FlockPrayerRequest[]> {
    const db = PostgresService.getInstance();

    // Get all flocks this user is a member of
    const { rows: memberships } = await db.query(
      `SELECT flock_id FROM flock_members WHERE member_user_id = $1::uuid`,
      [memberUserId]
    );

    if (memberships.length === 0) {
      throw new NotFoundError('You are not a member of any flock');
    }

    const results: FlockPrayerRequest[] = [];

    for (const membership of memberships) {
      for (const item of items) {
        const { rows } = await db.query(
          `INSERT INTO flock_prayer_requests (flock_id, member_user_id, member_name, name, category, prayer_focus, notes)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)
           RETURNING id, flock_id, member_user_id, member_name, name, category, prayer_focus, notes, created_at`,
          [membership.flock_id, memberUserId, memberName, item.name, item.category || null, item.prayerFocus || null, item.notes || null]
        );

        results.push({
          id: rows[0].id,
          flockId: rows[0].flock_id,
          memberUserId: rows[0].member_user_id,
          memberName: rows[0].member_name,
          name: rows[0].name,
          category: rows[0].category,
          prayerFocus: rows[0].prayer_focus,
          notes: rows[0].notes,
          createdAt: rows[0].created_at,
        });
      }
    }

    return results;
  }

  /**
   * Leader gets prayer requests shared by their flock members
   */
  public static async getPrayerRequests(leaderUserId: string): Promise<FlockPrayerRequest[]> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT fpr.id, fpr.flock_id, fpr.member_user_id, fpr.member_name,
              fpr.name, fpr.category, fpr.prayer_focus, fpr.notes, fpr.created_at
       FROM flock_prayer_requests fpr
       JOIN flocks f ON f.id = fpr.flock_id
       WHERE f.leader_user_id = $1::uuid
       ORDER BY fpr.created_at DESC`,
      [leaderUserId]
    );

    return rows.map((row: any) => ({
      id: row.id,
      flockId: row.flock_id,
      memberUserId: row.member_user_id,
      memberName: row.member_name,
      name: row.name,
      category: row.category,
      prayerFocus: row.prayer_focus,
      notes: row.notes,
      createdAt: row.created_at,
    }));
  }

  /**
   * Delete a prayer request (leader dismisses it)
   */
  public static async deletePrayerRequest(requestId: string, leaderUserId: string): Promise<void> {
    const db = PostgresService.getInstance();

    const { rowCount } = await db.query(
      `DELETE FROM flock_prayer_requests fpr
       USING flocks f
       WHERE fpr.id = $1::uuid
         AND fpr.flock_id = f.id
         AND f.leader_user_id = $2::uuid`,
      [requestId, leaderUserId]
    );

    if (rowCount === 0) {
      throw new NotFoundError('Prayer request');
    }
  }
}
