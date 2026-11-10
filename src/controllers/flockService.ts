// src/controllers/flockService.ts
import { PostgresService } from './postgres.service';
import { NotFoundError, ConflictError, ForbiddenError } from '../errors';
import {
  Flock,
  FlockWithStats,
  FlockMember,
  CreateFlockInput,
  FollowedLeader,
  FlockPrayerRequest,
  FlockRosterMember,
  FlockBlockedMember,
  FlockPrayerReport,
} from '../models/flock';
import crypto from 'crypto';

function mapRowToFlockPrayerRequest(row: any): FlockPrayerRequest {
  return {
    id: row.id,
    flockId: row.flock_id,
    memberUserId: row.member_user_id,
    memberName: row.member_name,
    name: row.name,
    category: row.category,
    prayerFocus: row.prayer_focus,
    notes: row.notes,
    status: (row.status ?? 'pending') as 'pending' | 'approved' | 'denied',
    anonymize: row.anonymize === true,
    createdAt: row.created_at,
  };
}

const FLOCK_PRAYER_REQUEST_COLUMNS = `id, flock_id, member_user_id, member_name,
       name, category, prayer_focus, notes, status, anonymize, created_at`;

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

    // Blocked users are told the flock does not exist. Deliberately the same
    // error as a bad QR code: a block is quiet, never announced.
    if (await this.isBlocked(flock.id, memberUserId)) {
      throw new NotFoundError('Flock');
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
    items: Array<{ name: string; category?: string; prayerFocus?: string; notes?: string }>,
    anonymize: boolean = false
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
          `INSERT INTO flock_prayer_requests (flock_id, member_user_id, member_name, name, category, prayer_focus, notes, anonymize)
           VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7, $8)
           RETURNING ${FLOCK_PRAYER_REQUEST_COLUMNS}`,
          [membership.flock_id, memberUserId, memberName, item.name, item.category || null, item.prayerFocus || null, item.notes || null, anonymize]
        );

        results.push(mapRowToFlockPrayerRequest(rows[0]));
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
              fpr.name, fpr.category, fpr.prayer_focus, fpr.notes, fpr.status,
              fpr.anonymize, fpr.created_at
       FROM flock_prayer_requests fpr
       JOIN flocks f ON f.id = fpr.flock_id
       WHERE f.leader_user_id = $1::uuid
         AND fpr.status = 'pending'
       ORDER BY fpr.created_at DESC`,
      [leaderUserId]
    );

    return rows.map(mapRowToFlockPrayerRequest);
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
                 fpr.name, fpr.category, fpr.prayer_focus, fpr.notes, fpr.status,
                 fpr.anonymize, fpr.created_at`,
      [requestId, leaderUserId]
    );

    if (!rows[0]) {
      throw new NotFoundError('Prayer request');
    }

    return mapRowToFlockPrayerRequest(rows[0]);
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

  // ===========================
  // Moderation (leader)
  // ===========================

  /** The leader's flock id, or NotFoundError if they have no flock. */
  private static async requireLeaderFlockId(leaderUserId: string): Promise<string> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT id FROM flocks WHERE leader_user_id = $1::uuid LIMIT 1`,
      [leaderUserId]
    );
    if (!rows[0]) throw new NotFoundError('Flock');
    return rows[0].id;
  }

  public static async isBlocked(flockId: string, userId: string): Promise<boolean> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT 1 FROM flock_blocks
       WHERE flock_id = $1::uuid AND blocked_user_id = $2::uuid
       LIMIT 1`,
      [flockId, userId]
    );
    return rows.length > 0;
  }

  /** Roster for the leader: who follows them, and who they have blocked. */
  public static async getRoster(
    leaderUserId: string
  ): Promise<{ members: FlockRosterMember[]; blocked: FlockBlockedMember[] }> {
    const db = PostgresService.getInstance();
    const flockId = await this.requireLeaderFlockId(leaderUserId);

    const { rows: memberRows } = await db.query(
      `SELECT fm.member_user_id, u.name, fm.joined_at, fm.parental_consent_given
       FROM flock_members fm
       JOIN users u ON u.id = fm.member_user_id
       WHERE fm.flock_id = $1::uuid
       ORDER BY fm.joined_at DESC, fm.id`,
      [flockId]
    );

    const { rows: blockedRows } = await db.query(
      `SELECT fb.blocked_user_id, u.name, fb.created_at
       FROM flock_blocks fb
       JOIN users u ON u.id = fb.blocked_user_id
       WHERE fb.flock_id = $1::uuid
       ORDER BY fb.created_at DESC, fb.id`,
      [flockId]
    );

    return {
      members: memberRows.map((row: any) => ({
        userId: row.member_user_id,
        name: row.name,
        joinedAt: row.joined_at,
        parentalConsentGiven: row.parental_consent_given === true,
      })),
      blocked: blockedRows.map((row: any) => ({
        userId: row.blocked_user_id,
        name: row.name,
        blockedAt: row.created_at,
      })),
    };
  }

  /**
   * Remove a member from the leader's flock. They can rejoin by scanning the
   * QR code again; use blockMember to prevent that. Their pending prayer
   * requests go with them.
   */
  public static async removeMember(leaderUserId: string, memberUserId: string): Promise<void> {
    const db = PostgresService.getInstance();
    const flockId = await this.requireLeaderFlockId(leaderUserId);

    await db.runInTransaction(async (tx) => {
      const { rowCount } = await tx.query(
        `DELETE FROM flock_members
         WHERE flock_id = $1::uuid AND member_user_id = $2::uuid`,
        [flockId, memberUserId]
      );
      if (rowCount === 0) throw new NotFoundError('Flock membership');

      await tx.query(
        `DELETE FROM flock_prayer_requests
         WHERE flock_id = $1::uuid AND member_user_id = $2::uuid AND status = 'pending'`,
        [flockId, memberUserId]
      );
    });
  }

  /**
   * Block a user from the leader's flock: drops their membership and pending
   * requests, and stops them rejoining. Idempotent, and works on someone who
   * has already left (e.g. blocking from an old prayer request).
   */
  public static async blockMember(leaderUserId: string, memberUserId: string): Promise<void> {
    const db = PostgresService.getInstance();

    if (leaderUserId === memberUserId) {
      throw new ConflictError('You cannot block yourself');
    }

    const flockId = await this.requireLeaderFlockId(leaderUserId);

    const { rows: userRows } = await db.query(
      `SELECT 1 FROM users WHERE id = $1::uuid LIMIT 1`,
      [memberUserId]
    );
    if (!userRows[0]) throw new NotFoundError('User');

    await db.runInTransaction(async (tx) => {
      await tx.query(
        `INSERT INTO flock_blocks (flock_id, blocked_user_id)
         VALUES ($1::uuid, $2::uuid)
         ON CONFLICT (flock_id, blocked_user_id) DO NOTHING`,
        [flockId, memberUserId]
      );
      await tx.query(
        `DELETE FROM flock_members
         WHERE flock_id = $1::uuid AND member_user_id = $2::uuid`,
        [flockId, memberUserId]
      );
      await tx.query(
        `DELETE FROM flock_prayer_requests
         WHERE flock_id = $1::uuid AND member_user_id = $2::uuid AND status = 'pending'`,
        [flockId, memberUserId]
      );
    });
  }

  /** Lift a block. Does not re-add the user; they rescan the QR code to rejoin. */
  public static async unblockMember(leaderUserId: string, memberUserId: string): Promise<void> {
    const db = PostgresService.getInstance();
    const flockId = await this.requireLeaderFlockId(leaderUserId);

    const { rowCount } = await db.query(
      `DELETE FROM flock_blocks
       WHERE flock_id = $1::uuid AND blocked_user_id = $2::uuid`,
      [flockId, memberUserId]
    );
    if (rowCount === 0) throw new NotFoundError('Block');
  }

  /**
   * Issue a new QR code identifier. The old one stops working immediately, so
   * every printed flyer and saved screenshot is dead. Existing members are
   * unaffected: membership is keyed on the flock id, not the code.
   */
  public static async resetQRCode(leaderUserId: string): Promise<Flock> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `UPDATE flocks
       SET qr_code_identifier = $2, updated_at = NOW()
       WHERE leader_user_id = $1::uuid
       RETURNING id, leader_user_id, name, qr_code_identifier, requires_age_verification, minimum_age, status, suspended_at, created_at, updated_at`,
      [leaderUserId, crypto.randomUUID()]
    );
    if (!rows[0]) throw new NotFoundError('Flock');
    return mapRowToFlock(rows[0]);
  }

  // ===========================
  // Flock prayer access + reporting
  // ===========================

  /**
   * True if the user may read or listen to this flock prayer: the flock's
   * leader, or a current member. A removed or blocked member loses access the
   * moment their membership row is gone.
   */
  public static async canAccessFlockPrayer(prayerId: string, userId: string): Promise<boolean> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT 1
       FROM prayers p
       JOIN flocks f ON f.id = p.flock_id
       WHERE p.id = $1::uuid
         AND (
           f.leader_user_id = $2::uuid
           OR EXISTS (
             SELECT 1 FROM flock_members fm
             WHERE fm.flock_id = f.id AND fm.member_user_id = $2::uuid
           )
         )
       LIMIT 1`,
      [prayerId, userId]
    );
    return rows.length > 0;
  }

  /**
   * A member reports a flock prayer. Only current members can report (the
   * leader has delete). One report per member per prayer; a repeat returns
   * the report with isNew = false so the caller does not re-notify.
   */
  public static async reportPrayer(
    prayerId: string,
    reporterUserId: string,
    reason: string | null
  ): Promise<FlockPrayerReport> {
    const db = PostgresService.getInstance();

    const { rows } = await db.query(
      `SELECT p.id AS prayer_id, p.title, p.text,
              f.id AS flock_id, f.name AS flock_name, f.leader_user_id,
              lu.name AS leader_name, ru.name AS reporter_name,
              EXISTS (
                SELECT 1 FROM flock_members fm
                WHERE fm.flock_id = f.id AND fm.member_user_id = $2::uuid
              ) AS is_member
       FROM prayers p
       JOIN flocks f ON f.id = p.flock_id
       JOIN users lu ON lu.id = f.leader_user_id
       JOIN users ru ON ru.id = $2::uuid
       WHERE p.id = $1::uuid
       LIMIT 1`,
      [prayerId, reporterUserId]
    );

    const row = rows[0];
    // Non-members get the same answer as a missing prayer, so the endpoint
    // cannot be used to probe which prayer ids exist.
    if (!row || (!row.is_member && row.leader_user_id !== reporterUserId)) {
      throw new NotFoundError('Flock prayer');
    }
    if (row.leader_user_id === reporterUserId) {
      throw new ForbiddenError('You cannot report your own prayer');
    }

    const { rows: inserted } = await db.query(
      `INSERT INTO flock_prayer_reports (flock_id, prayer_id, reporter_user_id, reason, prayer_title, prayer_text)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6)
       ON CONFLICT (prayer_id, reporter_user_id) DO NOTHING
       RETURNING id`,
      [row.flock_id, prayerId, reporterUserId, reason, row.title, row.text]
    );

    let reportId: string;
    if (inserted[0]) {
      reportId = inserted[0].id;
    } else {
      const { rows: existing } = await db.query(
        `SELECT id FROM flock_prayer_reports
         WHERE prayer_id = $1::uuid AND reporter_user_id = $2::uuid
         LIMIT 1`,
        [prayerId, reporterUserId]
      );
      reportId = existing[0].id;
    }

    return {
      id: reportId,
      flockName: row.flock_name,
      leaderName: row.leader_name,
      reporterName: row.reporter_name,
      prayerId,
      prayerTitle: row.title,
      prayerText: row.text,
      reason,
      isNew: !!inserted[0],
    };
  }
}
