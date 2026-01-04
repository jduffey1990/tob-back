// src/models/audioFile.ts
// Audio File Models for TTS Audio Caching

/**
 * Database model for audio_files table
 * Represents a cached TTS audio file in S3
 */
export interface AudioFile {
  id: string;                    // uuid
  prayerId: string;              // uuid - foreign key to prayers
  voiceId: string;               // Voice identifier (e.g., 'azure-male-1', 'fish-female-jordan')
  s3Bucket: string;              // S3 bucket name
  s3Key: string;                 // S3 object key (path)
  s3Url: string;                 // Full HTTPS URL for playback
  fileSizeBytes?: number;        // File size in bytes
  durationSeconds?: number;      // Audio duration in seconds
  provider?: string;             // 'azure' | 'fishaudio'
  createdAt: Date;               // When audio was generated
}

/**
 * Database row format (snake_case from PostgreSQL)
 */
export interface AudioFileRow {
  id: string;
  prayer_id: string;
  voice_id: string;
  s3_bucket: string;
  s3_key: string;
  s3_url: string;
  file_size_bytes?: number;
  duration_seconds?: number;
  provider?: string;
  created_at: Date;
}

/**
 * Audio generation state for a specific (prayer, voice) combination
 */
export enum AudioState {
  BUILDING = 'BUILDING',   // Currently generating
  READY = 'READY',         // Available for playback
  MISSING = 'MISSING'      // Not generated yet
}

/**
 * Response for audio state check endpoint
 */
export interface AudioStateResponse {
  state: AudioState;
  audioUrl?: string;         // Only present when state is READY
  fileSize?: number;         // Only present when state is READY
  duration?: number;         // Only present when state is READY
}

/**
 * Helper to convert database row to AudioFile model
 */
export function rowToAudioFile(row: AudioFileRow): AudioFile {
  return {
    id: row.id,
    prayerId: row.prayer_id,
    voiceId: row.voice_id,
    s3Bucket: row.s3_bucket,
    s3Key: row.s3_key,
    s3Url: row.s3_url,
    fileSizeBytes: row.file_size_bytes,
    durationSeconds: row.duration_seconds,
    provider: row.provider,
    createdAt: row.created_at
  };
}