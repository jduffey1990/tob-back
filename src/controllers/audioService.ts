// src/controllers/audioService.ts
// Audio Service - Handles audio file state management and generation orchestration

import { AudioFileRow, AudioState, AudioStateResponse, rowToAudioFile } from '../models/audioItem';
import { PostgresService } from './postgres.service';
import { redisService } from './redis.service';
import { S3Service } from './s3.service';
import { TTSService } from './ttsService';
import { AppError, ConflictError, ExternalServiceError, LimitReachedError, ValidationError } from '../errors/AppErrors';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqsClient = new SQSClient({});

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

    const voice = await TTSService.getVoiceById(voiceId);
    const voiceName = voice?.name ?? null;
    const provider = voice?.provider ?? 'unknown';

    // Acquire Redis lock (outside try so we don't clear a lock we never acquired)
    const lockAcquired = await redisService.markAsBuilding(prayerId, voiceId, 600);
    if (!lockAcquired) {
      throw new ConflictError('Audio generation already in progress');
    }

    // Insert tts_generations record
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

    try {
      const ttsResponse = await TTSService.generateAudio({
        prayerId, text, voiceId, userId
      });
      const ttsCompletedAt = new Date();

      const audioBuffer = Buffer.from(ttsResponse.audioData, 'base64');

      const s3UploadStartedAt = new Date();
      const { s3Key, s3Url } = await S3Service.uploadAudio(
        prayerId, voiceId, audioBuffer,
        { provider: ttsResponse.provider, characterCount: ttsResponse.metadata.characterCount }
      );
      const s3UploadCompletedAt = new Date();

      await db.query(
        `UPDATE tts_generations
        SET tts_completed_at      = $1,
            estimated_cost_usd    = $2,
            s3_upload_started_at  = $3,
            s3_upload_completed_at = $4,
            file_size_bytes       = $5,
            success               = true
        WHERE id = $6`,
        [ttsCompletedAt, ttsResponse.metadata.estimatedCost,
        s3UploadStartedAt, s3UploadCompletedAt, audioBuffer.length, ttsGenerationId]
      );

      await AudioService.saveAudioFile({
        prayerId, voiceId,
        s3Bucket: S3Service.getBucketName(),
        s3Key, s3Url,
        fileSizeBytes: audioBuffer.length,
        provider: ttsResponse.provider
      });

    } catch (error: any) {
      try {
        await db.query(
          `UPDATE tts_generations
          SET success = false, error_code = $1, error_message = $2
          WHERE id = $3`,
          [error instanceof AppError ? error.constructor.name : 'UNKNOWN_ERROR',
          error.message ?? String(error),
          ttsGenerationId]
        );
      } catch (dbError) {
        console.error('Failed to record generation failure:', dbError);
      }
      throw error;

    } finally {
      await redisService.clearBuilding(prayerId, voiceId);
    }
  }

  /**
   * Hand TTS generation to the worker Lambda via SQS.
   *
   * Why SQS and not a floating promise: on Lambda the container freezes
   * the moment the handler returns, stranding any in-flight async work.
   * That froze Fish Audio sockets mid-request, producing phantom 50s
   * timeouts on prayers that were only a few words long. The worker
   * Lambda runs each SQS message in its own invocation and stays alive
   * for the full duration, so TTS actually runs to completion.
   *
   */
  public static async enqueueGeneration(
    prayerId: string,
    text: string,
    voiceId: string,
    userId: string
  ): Promise<void> {
    // Single chokepoint for tier validation + trial-credit consumption.
    // Every TTS call (prayer creation, manual regen, flock) flows through
    // here, so the gate applies uniformly without per-route surgery.
    const db = PostgresService.getInstance();

    const voice = await TTSService.getVoiceById(voiceId);
    if (!voice) {
      throw new ValidationError(`Voice ${voiceId} not found`);
    }

    const userResult = await db.query<{ subscription_tier: string }>(
      `SELECT subscription_tier FROM users WHERE id = $1`,
      [userId]
    );
    const userTier = userResult.rows[0]?.subscription_tier ?? 'free';

    const { allowed, consumesTrialCredit } = await TTSService.canUserUseVoiceWithTrial(
      userId, userTier, voice
    );
    if (!allowed) {
      throw new LimitReachedError(`Voice ${voice.name} requires ${voice.tier} tier or higher`);
    }
    if (consumesTrialCredit) {
      const remaining = await TTSService.consumeTrialCredit(userId);
      if (remaining === null) {
        // Lost the race — another concurrent generation took the last credit.
        throw new LimitReachedError(`Voice ${voice.name} requires ${voice.tier} tier or higher`);
      }
    }

    // Local dev: no SQS, run TTS in-process. Fire-and-forget is safe here
    // because Node's event loop keeps running after the handler returns —
    // the Lambda freeze that breaks this pattern in prod does not apply
    // locally. Preserves the prod UX: fast 201, client polls audio-state.
    if (process.env.NODE_ENV === 'development') {
      console.log('🧪 [audioService] Local dev: running TTS inline (fire-and-forget)');
      this.generateAndStore(prayerId, text, voiceId, userId).catch((error: unknown) => {
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
      return;
    }

    const queueUrl = process.env.TTS_QUEUE_URL;
    if (!queueUrl) {
      throw new Error('TTS_QUEUE_URL is not configured');
    }

    await sqsClient.send(new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify({ prayerId, text, voiceId, userId }),
    }));

    console.log(`📬 [audioService] Enqueued TTS: prayer=${prayerId} voice=${voiceId}`);
  }
}
