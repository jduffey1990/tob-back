// src/controllers/audioService.ts
// Audio Service - Handles audio file state management and generation orchestration

import { AudioFileRow, AudioState, AudioStateResponse, rowToAudioFile } from '../models/audioItem';
import { PostgresService } from './postgres.service';
import { redisService } from './redis.service';
import { S3Service } from './s3.service';
import { TTSService } from './ttsService';
import { AppError, ConflictError, ExternalServiceError } from '../errors/AppErrors';

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
    
    // 1️⃣ Check Redis first - is it currently building?
    const isBuilding = await redisService.isBuilding(prayerId, voiceId);
    
    if (isBuilding) {
      const ttl = await redisService.getBuildingTTL(prayerId, voiceId);
      
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
      const audioFile = rowToAudioFile(result.rows[0]);
      
      return {
        state: AudioState.READY,
        audioUrl: audioFile.s3Url,
        fileSize: audioFile.fileSizeBytes,
        duration: audioFile.durationSeconds
      };
    }
    
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
    
    return deleteResult.rowCount || 0;
  }

    /**
   * Generate audio asynchronously with Redis locking and S3 storage
   * 
   * Flow:
   * 1. Acquire Redis lock (prevents duplicates)
   * 2. Call TTS API (Fish Audio or Azure)
   * 3. Convert base64 to Buffer
   * 4. Upload to S3
   * 5. Save metadata to database
   * 6. Clear Redis lock
   * 
   * @param prayerId - Prayer UUID
   * @param text - Prayer text to synthesize
   * @param voiceId - Voice identifier
   * @param userId - User UUID (for tier validation)
   */
  public static async generateAndStore(
    prayerId: string,
    text: string,
    voiceId: string,
    userId: string
  ): Promise<void> {
    
    const startTime = Date.now();
    
    // 1️⃣ Acquire Redis lock (outside try so we don't clear a lock we never acquired)
    const lockAcquired = await redisService.markAsBuilding(prayerId, voiceId, 600);
    
    if (!lockAcquired) {
      throw new ConflictError('Audio generation already in progress');
    }
    
    try {
      const ttsResponse = await TTSService.generateAudio({
        prayerId,
        text,
        voiceId,
        userId
      });
      
      const audioBuffer = Buffer.from(ttsResponse.audioData, 'base64');
      
      const { s3Key, s3Url } = await S3Service.uploadAudio(
        prayerId,
        voiceId,
        audioBuffer,
        {
          provider: ttsResponse.provider,
          characterCount: ttsResponse.metadata.characterCount
        }
      );
      
      await AudioService.saveAudioFile({
        prayerId,
        voiceId,
        s3Bucket: S3Service.getBucketName(),
        s3Key,
        s3Url,
        fileSizeBytes: audioBuffer.length,
        provider: ttsResponse.provider
      });
    } finally {
      await redisService.clearBuilding(prayerId, voiceId);
    }
  }

  
  /**
   * Generate audio in the background (fire and forget)
   * 
   * Use this when you want to return 202 Accepted immediately
   * and let generation happen asynchronously
   * 
   * @param prayerId - Prayer UUID
   * @param text - Prayer text
   * @param voiceId - Voice identifier
   * @param userId - User UUID
   */
  public static generateInBackground(
  prayerId: string,
  text: string,
  voiceId: string,
  userId: string
): void {
  this.generateAndStore(prayerId, text, voiceId, userId)
    .catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      
      console.error(JSON.stringify({
        level: 'error',
        type: 'background_audio_generation',
        prayerId,
        voiceId,
        userId,
        message: err.message,
        stack: err.stack,
        timestamp: new Date().toISOString(),
      }));
    });
}
}
