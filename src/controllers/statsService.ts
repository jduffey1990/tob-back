// src/controllers/statsService.ts
import { EmailService } from './email.service';
import { PostgresService } from './postgres.service';

/**
 * Daily stats digest service
 * 
 * Queries the database for key metrics and sends a formatted
 * HTML email to the admin. Triggered by EventBridge daily at 1 PM UTC.
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

interface UserStats {
  totalUsers: number;
  usersByTier: Record<string, number>;
  newUsersLast24h: number;
  newUsersByTier: Record<string, number>;
  expiredProUsers: number;
  unverifiedUsers: number;
}

interface ContentStats {
  totalPrayers: number;
  newPrayersLast24h: number;
  avgPrayersByTier: Record<string, string>;
  totalPlayCount: number;
  playsLast24h: number;
  mostPlayedPrayer: { title: string; play_count: number; user_name: string } | null;
}

interface AIStats {
  totalGenerations: number;
  generationsLast24h: number;
  avgResponseTimeMs: number | null;
  avgGenerationsPerUser: string;
}

interface AudioStats {
  totalAudioFiles: number;
  newAudioLast24h: number;
  byProvider: Record<string, number>;
  totalStorageBytes: number;
  totalDurationSeconds: number;
}

interface MiscStats {
  denominationBreakdown: Record<string, number>;
  passwordResetsLast24h: number;
  prayOnItStats: {
  total: number;
  newLast24h: number;
  avgPerUser: string;
};
  topUsers: Array<{ name: string; prayer_count: number; play_count: number }>;
}

interface DailyStats {
  generatedAt: string;
  users: UserStats;
  content: ContentStats;
  ai: AIStats;
  audio: AudioStats;
  misc: MiscStats;
}

// ============================================
// STATS SERVICE
// ============================================

export class StatsService {
  
  /**
   * Main entry point: gather all stats and send email
   */
  static async gatherAndSendDailyStats(): Promise<DailyStats> {
    console.log('📊 [StatsService] Gathering daily stats...');
    const startTime = Date.now();

    // Ensure DB pool is initialized (needed for EventBridge cold starts
    // where buildServer() hasn't run yet)
    const db = PostgresService.getInstance();
    db.connect({
      max: 1,
      idleTimeoutMillis: 120000,
      connectionTimeoutMillis: 5000,
    });

    const [users, content, ai, audio, misc] = await Promise.all([
      this.getUserStats(),
      this.getContentStats(),
      this.getAIStats(),
      this.getAudioStats(),
      this.getMiscStats(),
    ]);

    const stats: DailyStats = {
      generatedAt: new Date().toISOString(),
      users,
      content,
      ai,
      audio,
      misc,
    };

    const elapsed = Date.now() - startTime;
    console.log(`📊 [StatsService] Stats gathered in ${elapsed}ms`);

    // Send the email
    const adminEmail = process.env.ADMIN_STATS_EMAIL;
    if (!adminEmail) {
      console.warn('⚠️ [StatsService] ADMIN_STATS_EMAIL not set, skipping email');
      return stats;
    }

    const emailService = new EmailService();
    await emailService.sendDailyStatsEmail(adminEmail, stats);
    console.log(`✅ [StatsService] Daily stats email sent to ${adminEmail}`);

    return stats;
  }

  // ============================================
  // USER METRICS
  // ============================================

  private static async getUserStats(): Promise<UserStats> {
    const db = PostgresService.getInstance();

    // Total active users (not soft-deleted)
    const totalRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL`
    );

    // Users by tier
    const tierRes = await db.query<{ subscription_tier: string; count: string }>(
      `SELECT subscription_tier, COUNT(*) as count 
       FROM users 
       WHERE deleted_at IS NULL 
       GROUP BY subscription_tier 
       ORDER BY count DESC`
    );

    // New users in last 24 hours
    const newRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM users 
       WHERE created_at >= NOW() - INTERVAL '24 hours' 
       AND deleted_at IS NULL`
    );

    // New users by tier in last 24 hours
    const newTierRes = await db.query<{ subscription_tier: string; count: string }>(
      `SELECT subscription_tier, COUNT(*) as count 
       FROM users 
       WHERE created_at >= NOW() - INTERVAL '24 hours' 
       AND deleted_at IS NULL 
       GROUP BY subscription_tier`
    );

    // Expired pro subscriptions (pro users whose subscription has lapsed)
    const expiredRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM users 
       WHERE subscription_tier = 'pro' 
       AND subscription_expires_at IS NOT NULL 
       AND subscription_expires_at < NOW() 
       AND deleted_at IS NULL`
    );

    // Unverified users (status = 'inactive')
    const unverifiedRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM users 
       WHERE status = 'inactive' 
       AND deleted_at IS NULL`
    );

    return {
      totalUsers: parseInt(totalRes.rows[0].count),
      usersByTier: Object.fromEntries(tierRes.rows.map(r => [r.subscription_tier, parseInt(r.count)])),
      newUsersLast24h: parseInt(newRes.rows[0].count),
      newUsersByTier: Object.fromEntries(newTierRes.rows.map(r => [r.subscription_tier, parseInt(r.count)])),
      expiredProUsers: parseInt(expiredRes.rows[0].count),
      unverifiedUsers: parseInt(unverifiedRes.rows[0].count),
    };
  }

  // ============================================
  // CONTENT & ENGAGEMENT METRICS
  // ============================================

  private static async getContentStats(): Promise<ContentStats> {
    const db = PostgresService.getInstance();

    // Total prayers (user-created, not templates)
    const totalRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM prayers WHERE is_template = false`
    );

    // New prayers in last 24h
    const newRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM prayers 
       WHERE created_at >= NOW() - INTERVAL '24 hours' 
       AND is_template = false`
    );

    // Average prayers per user by tier
    const avgRes = await db.query<{ subscription_tier: string; avg_prayers: string }>(
      `SELECT u.subscription_tier, 
              ROUND(AVG(prayer_counts.cnt)::numeric, 1) as avg_prayers
       FROM users u
       LEFT JOIN (
         SELECT user_id, COUNT(*) as cnt 
         FROM prayers 
         WHERE is_template = false 
         GROUP BY user_id
       ) prayer_counts ON prayer_counts.user_id = u.id
       WHERE u.deleted_at IS NULL
       GROUP BY u.subscription_tier`
    );

    // Total play count (all time)
    const playRes = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(play_count), 0) as total FROM prayers`
    );

    // Plays in last 24h (prayers played recently)
    const recentPlayRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM prayers 
       WHERE last_played_at >= NOW() - INTERVAL '24 hours'`
    );

    // Most played prayer
    const mostPlayedRes = await db.query<{ title: string; play_count: number; name: string }>(
      `SELECT p.title, p.play_count, u.name
       FROM prayers p
       JOIN users u ON u.id = p.user_id
       WHERE p.is_template = false
       ORDER BY p.play_count DESC
       LIMIT 1`
    );

    return {
      totalPrayers: parseInt(totalRes.rows[0].count),
      newPrayersLast24h: parseInt(newRes.rows[0].count),
      avgPrayersByTier: Object.fromEntries(avgRes.rows.map(r => [r.subscription_tier, r.avg_prayers || '0'])),
      totalPlayCount: parseInt(playRes.rows[0].total),
      playsLast24h: parseInt(recentPlayRes.rows[0].count),
      mostPlayedPrayer: mostPlayedRes.rows[0] 
        ? { title: mostPlayedRes.rows[0].title, play_count: mostPlayedRes.rows[0].play_count, user_name: mostPlayedRes.rows[0].name }
        : null,
    };
  }

  // ============================================
  // AI GENERATION METRICS
  // ============================================

  private static async getAIStats(): Promise<AIStats> {
    const db = PostgresService.getInstance();

    // Total AI generations
    const totalRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ai_generations`
    );

    // Generations in last 24h
    const recentRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM ai_generations 
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );

    // Average response time in last 24h
    const avgTimeRes = await db.query<{ avg_ms: string | null }>(
      `SELECT ROUND(AVG(response_time_ms)::numeric) as avg_ms 
       FROM ai_generations 
       WHERE created_at >= NOW() - INTERVAL '24 hours' 
       AND response_time_ms IS NOT NULL`
    );

    // Average generations per user
    const avgPerUserRes = await db.query<{ avg_gens: string }>(
      `SELECT ROUND(AVG(gen_count)::numeric, 1) as avg_gens 
       FROM (
         SELECT user_id, COUNT(*) as gen_count 
         FROM ai_generations 
         GROUP BY user_id
       ) user_gens`
    );

    return {
      totalGenerations: parseInt(totalRes.rows[0].count),
      generationsLast24h: parseInt(recentRes.rows[0].count),
      avgResponseTimeMs: avgTimeRes.rows[0].avg_ms ? parseInt(avgTimeRes.rows[0].avg_ms) : null,
      avgGenerationsPerUser: avgPerUserRes.rows[0]?.avg_gens || '0',
    };
  }

  // ============================================
  // AUDIO / TTS METRICS
  // ============================================

  private static async getAudioStats(): Promise<AudioStats> {
    const db = PostgresService.getInstance();

    // Total audio files
    const totalRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM audio_files`
    );

    // New audio in last 24h
    const recentRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM audio_files 
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );

    // By provider
    const providerRes = await db.query<{ provider: string; count: string }>(
      `SELECT COALESCE(provider, 'unknown') as provider, COUNT(*) as count 
       FROM audio_files 
       GROUP BY provider 
       ORDER BY count DESC`
    );

    // Total storage
    const storageRes = await db.query<{ total_bytes: string; total_seconds: string }>(
      `SELECT 
         COALESCE(SUM(file_size_bytes), 0) as total_bytes,
         COALESCE(SUM(duration_seconds), 0) as total_seconds
       FROM audio_files`
    );

    return {
      totalAudioFiles: parseInt(totalRes.rows[0].count),
      newAudioLast24h: parseInt(recentRes.rows[0].count),
      byProvider: Object.fromEntries(providerRes.rows.map(r => [r.provider, parseInt(r.count)])),
      totalStorageBytes: parseInt(storageRes.rows[0].total_bytes),
      totalDurationSeconds: parseFloat(storageRes.rows[0].total_seconds),
    };
  }

  // ============================================
  // MISC / NICE-TO-HAVE METRICS
  // ============================================

  private static async getMiscStats(): Promise<MiscStats> {
    const db = PostgresService.getInstance();

    // Denomination breakdown
    const denomRes = await db.query<{ denomination: string; count: string }>(
      `SELECT denomination, COUNT(*) as count 
       FROM users 
       WHERE deleted_at IS NULL 
       GROUP BY denomination 
       ORDER BY count DESC`
    );

    // Password resets in last 24h
    const resetRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count 
       FROM password_reset_tokens 
       WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );

    // Pray On It metrics

    // Total items
    const totalRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM pray_on_it_items`
    );

    // New in last 24h
    const newRes = await db.query<{ count: string }>(
      `SELECT COUNT(*) as count
      FROM pray_on_it_items
      WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );

    // Average per user
    const avgRes = await db.query<{ avg_items: string }>(
      `SELECT ROUND(AVG(item_count)::numeric, 1) as avg_items
      FROM (
        SELECT user_id, COUNT(*) as item_count
        FROM pray_on_it_items
        GROUP BY user_id
      ) user_items`
    );

    // Top 5 power users (anonymized - first name + last initial only)
    const topUsersRes = await db.query<{ name: string; prayer_count: number; play_count: number }>(
      `SELECT 
         u.name,
         COUNT(p.id)::int as prayer_count,
         COALESCE(SUM(p.play_count), 0)::int as play_count
       FROM users u
       LEFT JOIN prayers p ON p.user_id = u.id AND p.is_template = false
       WHERE u.deleted_at IS NULL
       GROUP BY u.id, u.name
       ORDER BY prayer_count DESC, play_count DESC
       LIMIT 5`
    );

    return {
      denominationBreakdown: Object.fromEntries(denomRes.rows.map(r => [r.denomination, parseInt(r.count)])),
      passwordResetsLast24h: parseInt(resetRes.rows[0].count),
      prayOnItStats: {
        total: parseInt(totalRes.rows[0].count),
        newLast24h: parseInt(newRes.rows[0].count),
        avgPerUser: avgRes.rows[0]?.avg_items || '0',
      },
      topUsers: topUsersRes.rows.map(r => ({
        name: anonymizeName(r.name),
        prayer_count: r.prayer_count,
        play_count: r.play_count,
      })),
    };
  }
}

// ============================================
// HELPERS
// ============================================

/**
 * Anonymize name to "FirstName L." format
 */
function anonymizeName(name: string): string {
  if (!name) return 'Anonymous';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
}

/**
 * Format seconds to "Xh Ym" string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${Math.floor(seconds % 60)}s`;
}