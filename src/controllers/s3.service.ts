// src/controllers/s3.service.ts
// S3 service for storing TTS audio files

import { 
  DeleteObjectCommand, 
  DeleteObjectsCommand,      
  GetObjectCommand, 
  ListObjectsV2Command,      
  PutObjectCommand, 
  S3Client 
} from '@aws-sdk/client-s3';

import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export class S3Service {
  private static client: S3Client;
  private static bucket: string;

  private static ensureInitialized(): void {
  if (!S3Service.client || !S3Service.bucket) {
    throw new Error('S3Service not initialized. Call S3Service.initialize() first.');
  }
}

  /**
   * Initialize S3 client (call once at app startup)
   */
  public static initialize(): void {
    const region = process.env.AWS_REGION || 'us-east-2';
    const bucket = process.env.S3_AUDIO_BUCKET;

    if (!bucket) {
      throw new Error('S3_AUDIO_BUCKET environment variable is required');
    }

    S3Service.bucket = bucket;
    S3Service.client = new S3Client({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });

    console.log(`✅ S3 initialized: bucket=${bucket}, region=${region}`);
  }

  /**
   * Generate S3 key (path) for an audio file
   * Format: audio/{prayerId}/{voiceId}.mp3
   */
  public static generateKey(prayerId: string, voiceId: string): string {
    return `audio/${prayerId}/${voiceId}.mp3`;
  }

  /**
   * Upload audio file to S3
   * 
   * @param prayerId - Prayer UUID
   * @param voiceId - Voice identifier
   * @param audioBuffer - MP3 audio data as Buffer
   * @param metadata - Optional metadata (e.g., duration, provider)
   * @returns S3 key and public URL
   */
  public static async uploadAudio(
    prayerId: string,
    voiceId: string,
    audioBuffer: Buffer,
    metadata?: {
      duration?: number;
      provider?: string;
      characterCount?: number;
    }
  ): Promise<{ s3Key: string; s3Url: string }> {
    S3Service.ensureInitialized();

    const key = S3Service.generateKey(prayerId, voiceId);

    // Prepare metadata for S3
    const s3Metadata: Record<string, string> = {
      'prayer-id': prayerId,
      'voice-id': voiceId,
    };

    if (metadata?.duration) {
      s3Metadata['duration'] = metadata.duration.toString();
    }
    if (metadata?.provider) {
      s3Metadata['provider'] = metadata.provider;
    }
    if (metadata?.characterCount) {
      s3Metadata['character-count'] = metadata.characterCount.toString();
    }

    const command = new PutObjectCommand({
      Bucket: S3Service.bucket,
      Key: key,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
      Metadata: s3Metadata,
      // Optional: Add cache control for CDN
      CacheControl: 'max-age=31536000', // 1 year - audio files are immutable
    });

    try {
      await S3Service.client.send(command);

      // Generate public URL
      const s3Url = `https://${S3Service.bucket}.s3.${process.env.AWS_REGION || 'us-east-2'}.amazonaws.com/${key}`;

      console.log(`✅ Uploaded audio to S3: ${key}`);
      console.log(`   Size: ${audioBuffer.length} bytes`);
      console.log(`   URL: ${s3Url}`);

      return { s3Key: key, s3Url };
    } catch (error: any) {
      console.error(`❌ S3 upload failed:`, error);
      throw new Error(`S3 upload failed: ${error.message}`);
    }
  }

  /**
   * Generate a presigned URL for temporary access
   * Useful if bucket is private and you want time-limited access
   * 
   * @param s3Key - S3 object key
   * @param expiresIn - URL expiration in seconds (default: 1 hour)
   * @returns Presigned URL
   */
  public static async getPresignedUrl(
    s3Key: string,
    expiresIn: number = 3600
  ): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: S3Service.bucket,
      Key: s3Key,
    });

    try {
      const url = await getSignedUrl(S3Service.client, command, { expiresIn });
      return url;
    } catch (error: any) {
      console.error(`❌ Failed to generate presigned URL:`, error);
      throw new Error(`Presigned URL generation failed: ${error.message}`);
    }
  }

  /**
   * Delete an audio file from S3
   * Use when user deletes a prayer
   * 
   * @param s3Key - S3 object key
   */
  public static async deleteAudio(s3Key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: S3Service.bucket,
      Key: s3Key,
    });

    try {
      await S3Service.client.send(command);
      console.log(`✅ Deleted audio from S3: ${s3Key}`);
    } catch (error: any) {
      console.error(`❌ S3 delete failed:`, error);
      throw new Error(`S3 delete failed: ${error.message}`);
    }
  }

  /**
   * Delete all audio files for a prayer (all voice versions)
   * Called when user account is deleted
   * 
   * @param prayerId - Prayer UUID
   */
  public static async deleteAllAudioForPrayer(prayerId: string): Promise<void> {
    S3Service.ensureInitialized();

    const prefix = `audio/${prayerId}/`;

    try {
      // List all objects for this prayer
      const listCommand = new ListObjectsV2Command({
        Bucket: S3Service.bucket,
        Prefix: prefix
      });

      const listResponse = await S3Service.client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        console.log(`No audio files found for prayer ${prayerId}`);
        return;
      }

      // Delete all found objects
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: S3Service.bucket,
        Delete: {
          Objects: listResponse.Contents.map(obj => ({ Key: obj.Key! }))
        }
      });

      await S3Service.client.send(deleteCommand);

      console.log(`✅ Deleted ${listResponse.Contents.length} audio files for prayer ${prayerId}`);

    } catch (error: any) {
      console.error(`❌ S3 deletion failed for prayer ${prayerId}:`, error);
      // Don't throw - we still want to delete DB records even if S3 fails
    }
  }


  /**
   * Check if an audio file exists in S3
   * 
   * @param s3Key - S3 object key
   * @returns true if file exists, false otherwise
   */
  public static async exists(s3Key: string): Promise<boolean> {
    const command = new GetObjectCommand({
      Bucket: S3Service.bucket,
      Key: s3Key,
    });

    try {
      await S3Service.client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get bucket name (useful for logging/debugging)
   */
  public static getBucketName(): string {
    return S3Service.bucket;
  }
}