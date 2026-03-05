// src/controllers/audioService.ts
// Audio Service - Handles audio file state management and generation orchestration

import { AudioFileRow, AudioState, AudioStateResponse, rowToAudioFile } from '../models/audioItem';
import { PostgresService } from './postgres.service';
import { redisService } from './redis.service';
import { S3Service } from './s3.service';
import { TTSService } from './ttsService';

export class AudioService {
  
  /**
   * Get the current state of audio for a (prayer, voice) combination
   * 
   * State resolution order:
   * 1. Check Redis: Is it currently BUILDING?
   * 2. Check DB: Does it already exist (READY)?
   * 3. Otherwise: MISSING
   * 
   * @param prayerId - Prayer UUID
   * @param voiceId - Voice identifier
   * @returns Audio state and URL (if READY)
   */
  public static async getAudioState(
    prayerId: string,
    voiceId: string
  ): Promise<AudioStateResponse> {
    
    console.log(`🔍 [AudioService] Checking state: prayer=${prayerId}, voice=${voiceId}`);
    
    // 1️⃣ Check Redis first - is it currently building?
    const isBuilding = await redisService.isBuilding(prayerId, voiceId);

    console.log(`Redis isBuildng = ${isBuilding}`)
    
    if (isBuilding) {
      const ttl = await redisService.getBuildingTTL(prayerId, voiceId);
      console.log(`   ⏳ BUILDING (${ttl}s remaining)`);
      
      return {
        state: AudioState.BUILDING
      };
    }
    
    // 2️⃣ Check database - does audio file already exist?
    const db = PostgresService.getInstance();
    
    const result = await db.query<AudioFileRow>(
      `SELECT * FROM audio_files 
       WHERE prayer_id = $1 AND voice_id = $2 
       LIMIT 1`,
      [prayerId, voiceId]
    );
    
    if (result.rows.length > 0) {
      console.log("prayer audio found")
      const audioFile = rowToAudioFile(result.rows[0]);
      
      console.log(`   ✅ READY`);
      console.log(`      URL: ${audioFile.s3Url}`);
      
      return {
        state: AudioState.READY,
        audioUrl: audioFile.s3Url,
        fileSize: audioFile.fileSizeBytes,
        duration: audioFile.durationSeconds
      };
    }

    console.log("prayer audio not found")
    
    // 3️⃣ Doesn't exist and not building
    return {
      state: AudioState.MISSING
    };
  }
  
  /**
   * Check if a prayer exists and user owns it
   * 
   * @param prayerId - Prayer UUID
   * @param userId - User UUID
   * @returns Prayer data or null if not found/not owned
   */
  public static async getPrayerForUser(
    prayerId: string,
    userId: string
  ): Promise<{ id: string; text: string; title: string } | null> {
    
    const db = PostgresService.getInstance();
    
    const result = await db.query<{ id: string; text: string; title: string }>(
      `SELECT id, text, title 
       FROM prayers 
       WHERE id = $1 AND user_id = $2
       LIMIT 1`,
      [prayerId, userId]
    );
    
    if (result.rows.length === 0) {
      return null;
    }
    
    return result.rows[0];
  }
  
  /**
   * Save generated audio file metadata to database
   * 
   * @param data - Audio file data to save
   * @returns Created audio file record
   */
  public static async saveAudioFile(data: {
    prayerId: string;
    voiceId: string;
    s3Bucket: string;
    s3Key: string;
    s3Url: string;
    fileSizeBytes: number;
    durationSeconds?: number;
    provider: string;
  }) {
    const db = PostgresService.getInstance();
    
    const result = await db.query<AudioFileRow>(
      `INSERT INTO audio_files (
        prayer_id, voice_id, s3_bucket, s3_key, s3_url,
        file_size_bytes, duration_seconds, provider
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (prayer_id, voice_id) DO UPDATE SET
        s3_url = EXCLUDED.s3_url,
        file_size_bytes = EXCLUDED.file_size_bytes,
        duration_seconds = EXCLUDED.duration_seconds,
        created_at = NOW()
      RETURNING *`,
      [
        data.prayerId,
        data.voiceId,
        data.s3Bucket,
        data.s3Key,
        data.s3Url,
        data.fileSizeBytes,
        data.durationSeconds || null,
        data.provider
      ]
    );
    
    console.log(`✅ [AudioService] Saved audio file to database`);
    console.log(`   Prayer: ${data.prayerId}`);
    console.log(`   Voice: ${data.voiceId}`);
    console.log(`   URL: ${data.s3Url}`);
    
    return rowToAudioFile(result.rows[0]);
  }
  
  /**
   * Delete all audio files for a prayer (when prayer is deleted)
   * 
   * @param prayerId - Prayer UUID
   * @returns Number of audio files deleted
   */
  public static async deleteAudioForPrayer(prayerId: string): Promise<number> {
    const db = PostgresService.getInstance();
    
    // First get all S3 keys to delete from S3
    const filesResult = await db.query<AudioFileRow>(
      'SELECT s3_key FROM audio_files WHERE prayer_id = $1',
      [prayerId]
    );
    
    // Delete from S3 (we'll implement this in the generation flow)
    // For now, just delete from database
    
    const deleteResult = await db.query(
      'DELETE FROM audio_files WHERE prayer_id = $1',
      [prayerId]
    );
    
    console.log(`🗑️ [AudioService] Deleted ${deleteResult.rowCount} audio files for prayer ${prayerId}`);
    
    return deleteResult.rowCount || 0;
  }

  /**
   * Generate audio asynchronously with Redis locking, S3 storage, and
   * full generation lifecycle tracking in tts_generations.
   * 
   * Instrumentation phases:
   *   INSERT  → lock acquired (captures intent + tts_started_at)
   *   UPDATE  → after TTS API returns (tts_completed_at, cost)
   *   UPDATE  → after S3 upload (s3 timing, file size)
   *   UPDATE  → final success/failure flag + error details
   */
  public static async generateAndStore(
    prayerId: string,
    text: string,
    voiceId: string,
    userId: string
  ): Promise<void> {
    
    const startTime = Date.now();

    const voice = TTSService.getVoiceById(voiceId);
    const voiceName = voice?.name ?? null;
    const provider = voice?.provider ?? 'unknown';

    // ── 1. Acquire Redis lock ──
    const lockAcquired = await redisService.markAsBuilding(prayerId, voiceId, 600);
    if (!lockAcquired) {
      throw new Error('ALREADY_BUILDING: Audio generation already in progress');
    }
    console.log(`🔒 [AudioGeneration] Lock acquired (TTL: 600s)`);

    // ── 2. Insert tts_generations record ──
    // Use a quick query then let the connection go idle
    const db = PostgresService.getInstance();
    const ttsStartedAt = new Date();

    const generationInsert = await db.query<{ id: string }>(
      `INSERT INTO tts_generations (
        user_id, prayer_id, voice_id, voice_name, provider,
        character_count, tts_started_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id`,
      [userId, prayerId, voiceId, voiceName, provider, text.length, ttsStartedAt]
    );
    const ttsGenerationId = generationInsert.rows[0].id;
    console.log(`📝 [AudioGeneration] tts_generations record created: ${ttsGenerationId}`);

    try {
      // ── 3. Call TTS API (THE LONG PART - no DB needed here) ──
      console.log(`🎙️ [AudioGeneration] Calling TTSService...`);
      const ttsResponse = await TTSService.generateAudio({
        prayerId, text, voiceId, userId
      });
      const ttsCompletedAt = new Date();
      console.log(`✅ [AudioGeneration] TTS complete in ${ttsResponse.metadata.responseTimeMs}ms`);

      // ── 4. Convert to buffer (no DB, no network) ──
      const audioBuffer = Buffer.from(ttsResponse.audioData, 'base64');
      console.log(`📦 [AudioGeneration] Buffer: ${audioBuffer.length} bytes`);

      // ── 5. Upload to S3 (no DB needed) ──
      const s3UploadStartedAt = new Date();
      console.log(`☁️ [AudioGeneration] Uploading to S3...`);
      
      const { s3Key, s3Url } = await S3Service.uploadAudio(
        prayerId, voiceId, audioBuffer,
        { provider: ttsResponse.provider, characterCount: ttsResponse.metadata.characterCount }
      );
      const s3UploadCompletedAt = new Date();
      console.log(`✅ [AudioGeneration] S3 done: ${s3Key}`);

      // ── 6. NOW hit the DB — single batch update + insert ──
      // Connection is grabbed fresh here, after the long operations are done.
      // Combine all the updates into one query to minimize round trips.
      await db.query(
        `UPDATE tts_generations
        SET tts_completed_at    = $1,
            estimated_cost_usd  = $2,
            s3_upload_started_at  = $3,
            s3_upload_completed_at = $4,
            file_size_bytes     = $5,
            success             = true
        WHERE id = $6`,
        [
          ttsCompletedAt,
          ttsResponse.metadata.estimatedCost,
          s3UploadStartedAt,
          s3UploadCompletedAt,
          audioBuffer.length,
          ttsGenerationId
        ]
      );

      await AudioService.saveAudioFile({
        prayerId, voiceId,
        s3Bucket: S3Service.getBucketName(),
        s3Key, s3Url,
        fileSizeBytes: audioBuffer.length,
        provider: ttsResponse.provider
      });

      const totalTime = Date.now() - startTime;
      console.log(`✅ [AudioGeneration] COMPLETE in ${totalTime}ms`);

    } catch (error: any) {
      console.error(`❌ [AudioGeneration] Generation failed:`, error);

      const errorCode = error.message?.split(':')[0]?.trim() ?? 'UNKNOWN_ERROR';
      const errorMessage = error.message ?? String(error);

      try {
        await db.query(
          `UPDATE tts_generations
          SET success = false, error_code = $1, error_message = $2
          WHERE id = $3`,
          [errorCode, errorMessage, ttsGenerationId]
        );
      } catch (dbError) {
        console.error(`❌ [AudioGeneration] Failed to record failure:`, dbError);
      }
      throw error;

    } finally {
      await redisService.clearBuilding(prayerId, voiceId);
      console.log(`🔓 [AudioGeneration] Lock released`);
    }
  }
  
  /**
   * Generate audio in the background (fire and forget).
   * Returns immediately with 202 Accepted while generation runs async.
   */
  public static generateInBackground(
    prayerId: string,
    text: string,
    voiceId: string,
    userId: string
  ): void {
    this.generateAndStore(prayerId, text, voiceId, userId)
      .then(() => {
        console.log(`🎉 [AudioGeneration] Background generation succeeded`);
      })
      .catch((error) => {
        console.error(`❌ [AudioGeneration] Background generation failed:`, error);
      });
  }
}
