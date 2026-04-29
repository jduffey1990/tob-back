// src/controllers/flockService.ts
import { PostgresService } from './postgres.service';
import { NotFoundError, ConflictError } from '../errors';
import {
  Flock,
  FlockWithStats,
  FlockMember,
  CreateFlockInput,
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
    requiresAgeVerification: row.requires_age_verification ?? false,
    minimumAge: row.minimum_age ?? 18,
    status: (row.status ?? 'active') as 'active' | 'suspended',
    suspendedAt: row.suspended_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
      `INSERT INTO flocks (leader_user_id, name, qr_code_identifier, requires_age_verification, minimum_age)
       VALUES ($1::uuid, $2, $3, $4, $5)
       RETURNING id, leader_user_id, name, qr_code_identifier, requires_age_verification, minimum_age, status, suspended_at, created_at, updated_at`,
      [input.leaderUserId, input.name, qrCodeIdentifier, input.requiresAgeVerification ?? false, input.minimumAge ?? 18]
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
              f.requires_age_verification, f.minimum_age,
              f.status, f.suspended_at,
              f.created_at, f.updated_at,
              (SELECT COUNT(*) FROM flock_members fm WHERE fm.flock_id = f.id) AS follower_count,
              (SELECT COUNT(*) FROM prayers p WHERE p.flock_id = f.id) AS published_prayer_count
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
      `SELECT id, leader_user_id, name, qr_code_identifier, requires_age_verification, minimum_age, status, suspended_at, created_at, updated_at
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
  public static async joinFlock(
    qrCodeIdentifier: string,
    memberUserId: string,
    isUnderAge?: boolean,
    parentalConsentGiven?: boolean,
  ): Promise<FlockMember> {
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

    // Age verification enforcement
    if (flock.requiresAgeVerification && isUnderAge && !parentalConsentGiven) {
      throw new ConflictError('Parental consent is required to join this flock');
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

    const consentValue = !!(flock.requiresAgeVerification && isUnderAge && parentalConsentGiven);

    const { rows } = await db.query(
      `INSERT INTO flock_members (flock_id, member_user_id, parental_consent_given)
       VALUES ($1::uuid, $2::uuid, $3)
       RETURNING id, flock_id, member_user_id, parental_consent_given, joined_at`,
      [flock.id, memberUserId, consentValue]
    );

    return {
      id: rows[0].id,
      flockId: rows[0].flock_id,
      memberUserId: rows[0].member_user_id,
      parentalConsentGiven: rows[0].parental_consent_given,
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
              fm.joined_at,
              f.status AS flock_status
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
      flockStatus: (row.flock_status ?? 'active') as 'active' | 'suspended',
    }));
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
          status: rows[0].status ?? 'pending',
          createdAt: rows[0].created_at,
        });
      }
    }

    return results;
  }

  /**
   * Leader gets pending prayer requests shared by their flock members
   */
  public static async getPrayerRequests(leaderUserId: string): Promise<FlockPrayerRequest[]> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT fpr.id, fpr.flock_id, fpr.member_user_id, fpr.member_name,
              fpr.name, fpr.category, fpr.prayer_focus, fpr.notes, fpr.status, fpr.created_at
       FROM flock_prayer_requests fpr
       JOIN flocks f ON f.id = fpr.flock_id
       WHERE f.leader_user_id = $1::uuid
         AND fpr.status = 'pending'
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
      status: row.status,
      createdAt: row.created_at,
    }));
  }

  /**
   * Approve a prayer request — sets status to 'approved' and returns the request data
   */
  public static async approvePrayerRequest(requestId: string, leaderUserId: string): Promise<FlockPrayerRequest> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `UPDATE flock_prayer_requests fpr
       SET status = 'approved'
       FROM flocks f
       WHERE fpr.id = $1::uuid
         AND fpr.flock_id = f.id
         AND f.leader_user_id = $2::uuid
         AND fpr.status = 'pending'
       RETURNING fpr.id, fpr.flock_id, fpr.member_user_id, fpr.member_name,
                 fpr.name, fpr.category, fpr.prayer_focus, fpr.notes, fpr.status, fpr.created_at`,
      [requestId, leaderUserId]
    );

    if (!rows[0]) {
      throw new NotFoundError('Prayer request');
    }

    return {
      id: rows[0].id,
      flockId: rows[0].flock_id,
      memberUserId: rows[0].member_user_id,
      memberName: rows[0].member_name,
      name: rows[0].name,
      category: rows[0].category,
      prayerFocus: rows[0].prayer_focus,
      notes: rows[0].notes,
      status: rows[0].status,
      createdAt: rows[0].created_at,
    };
  }

  /**
   * Deny a prayer request — sets status to 'denied'
   */
  public static async denyPrayerRequest(requestId: string, leaderUserId: string): Promise<void> {
    const db = PostgresService.getInstance();

    const { rowCount } = await db.query(
      `UPDATE flock_prayer_requests fpr
       SET status = 'denied'
       FROM flocks f
       WHERE fpr.id = $1::uuid
         AND fpr.flock_id = f.id
         AND f.leader_user_id = $2::uuid
         AND fpr.status = 'pending'`,
      [requestId, leaderUserId]
    );

    if (rowCount === 0) {
      throw new NotFoundError('Prayer request');
    }
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
