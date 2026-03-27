// src/controllers/ttsService.ts
import axios from 'axios';
import {
  TTSRequest,
  TTSResponse,
  VoiceOption
} from '../models/ttsItems';
import { PostgresService } from './postgres.service';
import {NotFoundError, ValidationError, ExternalServiceError, LimitReachedError} from '../errors/AppErrors'

// ============================================
// TTS Service - With Fish Audio WebSocket Streaming
// ============================================

export class TTSService {

  // Retry helper — retries on transient network errors and timeouts
  private static async callWithRetry<T>(
    fn: () => Promise<T>,
    retries: number = 1,
    delayMs: number = 3000
  ): Promise<T> {
    try {
      return await fn();
    } catch (error: any) {
      const isRetryable =
        error.code === 'ECONNRESET' ||
        error.code === 'ECONNABORTED' ||
        error.code === 'ETIMEDOUT' ||
        error.message?.includes('socket hang up') ||
        error.message?.includes('timeout');

      if (retries > 0 && isRetryable) {
        console.log(`🔄 [TTSService] Retrying after ${delayMs}ms (${retries} retries left) — ${error.message}`);
        await new Promise(r => setTimeout(r, delayMs));
        return this.callWithRetry(fn, retries - 1, delayMs);
      }
      throw error;
    }
  }
  
  /**
   * Main entry point: Generate audio for a prayer
   */
  static async generateAudio(request: TTSRequest): Promise<TTSResponse> {
    const db = PostgresService.getInstance();
    
    // 1. Get user's subscription tier
    const userResult = await db.query(
      'SELECT subscription_tier FROM users WHERE id = $1',
      [request.userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new NotFoundError('User');
    }
    
    const tier = userResult.rows[0].subscription_tier;
    console.log(`   User tier: ${tier}`);
    
    // 2. Validate voice is allowed for this tier
    const voice = await this.getVoiceById(request.voiceId);
    if (!voice) {
      throw new ValidationError(`Voice ${request.voiceId} not found`);
    }
    
    if (!this.canUserUseVoice(tier, voice)) {
      throw new LimitReachedError(`Voice ${voice.name} requires ${voice.tier} tier or higher`);
    }
    
    // 3. Generate audio based on provider
    const startTime = Date.now();
    let audioData: string;
    let estimatedCost: number;
    
    try {
      switch (voice.provider) {
        case 'apple':
          // Apple TTS is handled client-side (iOS)
          throw new Error('Apple TTS should be handled on iOS device');
          
        case 'azure':
          ({ audioData, estimatedCost } = await this.generateAzureTTS(request.text, voice));
          break;
          
        case 'fishaudio':
          // NEW: Use WebSocket streaming instead of REST API
          ({ audioData, estimatedCost } = await this.generateFishAudioTTS(request.text, voice));
          break;

        // case 'cartesia':
        //   ({ audioData, estimatedCost } = await this.generateCartesiaTTS(request.text, voice));
        //   break;

        default:
          throw new Error(`Unknown provider: ${voice.provider}`);
      }
      
      const responseTime = Date.now() - startTime;
      
      // 4. Build response
      const response: TTSResponse = {
        success: true,
        audioData,
        audioFormat: 'mp3',
        voiceUsed: voice.name,
        provider: voice.provider,
        metadata: {
          characterCount: request.text.length,
          estimatedCost,
          generatedAt: new Date().toISOString(),
          responseTimeMs: responseTime
        }
      };
      
      return response;
      
    } catch (error: any) {
      console.error(`❌ [TTSService] Error:`, error);
      throw error;
    }
  }
  
  /**
   * Generate audio using Azure Cognitive Services TTS
   */
  private static async generateAzureTTS(
    text: string,
    voice: VoiceOption
  ): Promise<{ audioData: string; estimatedCost: number }> {
    
    const azureKey = process.env.AZURE_TTS_API_KEY;
    const azureRegion = process.env.AZURE_TTS_REGION || 'eastus';
    
    if (!azureKey) {
      throw new ExternalServiceError('Azure TTS', 'API key not configured');
    }
    
    console.log(`🔵 [TTSService] Calling Azure TTS...`);
    console.log(`   Region: ${azureRegion}`);
    console.log(`   Voice: ${voice.id}`);
    
    try {
      const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
      
      const ssml = `
        <speak version="1.0" 
              xmlns="http://www.w3.org/2001/10/synthesis" 
              xml:lang="${voice.id.split('-').slice(0,2).join('-')}">
          <voice name="${voice.id}">
            ${text}
          </voice>
        </speak>
      `.trim();
      
      const response = await axios.post(url, ssml, {
        headers: {
          'Ocp-Apim-Subscription-Key': azureKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
        },
        responseType: 'arraybuffer'
      });
      
      const audioData = Buffer.from(response.data).toString('base64');
      const estimatedCost = (text.length / 1_000_000) * 10;
      
      return { audioData, estimatedCost };
      
    } catch (error: any) {
      throw new ExternalServiceError('Azure TTS', error.message);
    }
  }
  
  /**
   * 
   * Generate audio using Fish Audio REST API (deprecated - use streaming instead)
   */
  private static async generateFishAudioTTS(
    text: string,
    voice: VoiceOption
  ): Promise<{ audioData: string; estimatedCost: number }> {
    
    const fishAudioKey = process.env.FISH_API_KEY;
    
    if (!fishAudioKey) {
      throw new ExternalServiceError('Fish Audio', 'API key not configured');
    }
    
    try {
      const url = 'https://api.fish.audio/v1/tts';
      
      // Build request body
      const requestBody: any = {
        text: text,
        format: 'mp3'
      };
      
      // Add reference_id for custom/cloned voices
      if (voice.id && voice.id !== 'default') {
        requestBody.reference_id = voice.id;
      }
      
      // Call Fish Audio API
      // NOTE: Model goes in HEADER, not body!
      const response = await this.callWithRetry(() =>
          axios.post(url, requestBody, {
          headers: {
            'Authorization': `Bearer ${fishAudioKey}`,
            'Content-Type': 'application/json',
            'model': 's1'
          },
          responseType: 'arraybuffer',
          timeout: 50000  // 50 seconds per attempt — allows 1 retry within 120s Lambda limit
        })
      );

      
      // Convert binary audio to base64
      const audioData = Buffer.from(response.data).toString('base64');
      
      // Fish Audio pricing: ~$10 per 1M characters (estimate)
      const estimatedCost = (text.length / 1_000_000) * 10;
      
      return { audioData, estimatedCost };
      
    } catch (error: any) {
      if (error.response?.status === 402) {
        throw new ExternalServiceError('Fish Audio', 'Insufficient balance in Fish Audio account');
      }
      throw new ExternalServiceError('Fish Audio', error.message);
    }
  }
  
  // /**
  //  * Generate audio using Cartesia TTS API
  //  * Commented out — may revisit Cartesia later.
  //  */
  // private static async generateCartesiaTTS(
  //   text: string,
  //   voice: VoiceOption
  // ): Promise<{ audioData: string; estimatedCost: number }> {
  //
  //   const cartesiaKey = process.env.CARTESIA_API_KEY;
  //
  //   if (!cartesiaKey) {
  //     throw new ExternalServiceError('Cartesia', 'API key not configured');
  //   }
  //
  //   console.log(`🟣 [TTSService] Calling Cartesia TTS...`);
  //   console.log(`   Voice: ${voice.name} (${voice.id})`);
  //
  //   try {
  //     const url = 'https://api.cartesia.ai/tts/bytes';
  //
  //     const requestBody = {
  //       model_id: 'sonic-2',
  //       transcript: text,
  //       voice: {
  //         mode: 'id',
  //         id: voice.id,
  //       },
  //       output_format: {
  //         container: 'mp3',
  //         sample_rate: 44100,
  //         bit_rate: 128000,
  //       },
  //     };
  //
  //     const response = await this.callWithRetry(() =>
  //       axios.post(url, requestBody, {
  //         headers: {
  //           'Cartesia-Version': '2025-04-16',
  //           'X-API-Key': cartesiaKey,
  //           'Content-Type': 'application/json',
  //         },
  //         responseType: 'arraybuffer',
  //         timeout: 30000,
  //       })
  //     );
  //
  //     const audioData = Buffer.from(response.data).toString('base64');
  //
  //     // Cartesia pricing: ~$8 per 1M characters (estimate)
  //     const estimatedCost = (text.length / 1_000_000) * 8;
  //
  //     console.log(`✅ [TTSService] Cartesia TTS complete — ${Buffer.byteLength(response.data)} bytes`);
  //
  //     return { audioData, estimatedCost };
  //
  //   } catch (error: any) {
  //     if (error.response?.status === 401) {
  //       throw new ExternalServiceError('Cartesia', 'Invalid API key');
  //     }
  //     if (error.response?.status === 402) {
  //       throw new ExternalServiceError('Cartesia', 'Insufficient balance');
  //     }
  //     throw new ExternalServiceError('Cartesia', error.message);
  //   }
  // }

  private static readonly TIER_HIERARCHY: Record<string, number> = {
    'free': 0,
    'pro': 1,
    'prayer_warrior': 2,
    'lifetime': 3
  };

  /**
   * Check if a user's tier allows them to use a specific voice
   */
  static canUserUseVoice(userTier: string, voice: VoiceOption): boolean {
    const userLevel = this.TIER_HIERARCHY[userTier.toLowerCase()] ?? 0;
    const voiceLevel = this.TIER_HIERARCHY[voice.tier.toLowerCase()] ?? 0;
    return userLevel >= voiceLevel;
  }

  /**
   * Map a DB row to a VoiceOption
   */
  private static mapRowToVoice(row: any): VoiceOption {
    return {
      id: row.id,
      name: row.name,
      language: row.language,
      gender: row.gender,
      description: row.description,
      tier: row.tier,
      provider: row.provider,
      previewUrl: row.preview_url,
      previewText: row.preview_text,
      isActive: row.is_active,
      sortOrder: row.sort_order,
    };
  }

  /**
   * Get all active voices from DB
   */
  static async getAvailableVoices(): Promise<VoiceOption[]> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT * FROM voices WHERE is_active = true ORDER BY sort_order`
    );
    return rows.map(this.mapRowToVoice);
  }

  /**
   * Get a specific voice by ID
   */
  static async getVoiceById(voiceId: string): Promise<VoiceOption | null> {
    const db = PostgresService.getInstance();
    const { rows } = await db.query(
      `SELECT * FROM voices WHERE id = $1 AND is_active = true LIMIT 1`,
      [voiceId]
    );
    return rows[0] ? this.mapRowToVoice(rows[0]) : null;
  }

  /**
   * Get voices available to a specific user based on their tier
   */
  static async getVoicesForTier(tier: string): Promise<VoiceOption[]> {
    const allVoices = await this.getAvailableVoices();
    return allVoices.filter(voice => this.canUserUseVoice(tier, voice));
  }
}