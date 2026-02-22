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
    const voice = this.getVoiceById(request.voiceId);
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
      const response = await axios.post(url, requestBody, {
        headers: {
          'Authorization': `Bearer ${fishAudioKey}`,
          'Content-Type': 'application/json',
          'model': 's1'  // OpenAudio S1 - best quality
        },
        responseType: 'arraybuffer'
      });
      
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
  
  /**
   * Check if a user's tier allows them to use a specific voice
   */
  private static canUserUseVoice(userTier: string, voice: VoiceOption): boolean {
    const tierHierarchy: Record<string, number> = {
      'free': 0,
      'pro': 1,
      'warrior': 2,
      'lifetime': 3
    };
    
    const userLevel = tierHierarchy[userTier.toLowerCase()] ?? 0;
    const voiceLevel = tierHierarchy[voice.tier.toLowerCase()] ?? 0;
    
    return userLevel >= voiceLevel;
  }
  
  /**
   * Get all available voices
   */
  static getAvailableVoices(): VoiceOption[] {
    return [
      // FREE TIER - Apple Voices (handled client-side)
      {
        id: 'com.apple.voice.compact.en-US.Samantha',
        name: 'Samantha',
        language: 'en-US',
        gender: 'female',
        description: 'Natural American English voice',
        tier: 'free',
        provider: 'apple'
      },
      {
        id: 'com.apple.voice.compact.en-GB.Daniel',
        name: 'Daniel',
        language: 'en-GB',
        gender: 'male',
        description: 'British English voice',
        tier: 'free',
        provider: 'apple'
      },
      {
        id: 'com.apple.voice.compact.en-IE.Moira',
        name: 'Moira',
        language: 'en-IE',
        gender: 'female',
        description: 'Irish English voice',
        tier: 'free',
        provider: 'apple'
      },
      
      // PRO TIER - Azure Voices
      {
        id: 'en-US-JennyNeural',
        name: 'Jenny',
        language: 'en-US',
        gender: 'female',
        description: 'Warm and friendly American voice',
        tier: 'pro',
        provider: 'azure',
        file: 'jenny_neural'
      },
      {
        id: 'en-US-GuyNeural',
        name: 'Guy',
        language: 'en-US',
        gender: 'male',
        description: 'Professional American voice',
        tier: 'pro',
        provider: 'azure',
        file: 'guy_neural'
      },
      {
        id: 'en-GB-SoniaNeural',
        name: 'Sonia',
        language: 'en-GB',
        gender: 'female',
        description: 'Clear British voice',
        tier: 'pro',
        provider: 'azure',
        file: 'sonia_neural'
      },
      {
        id: 'en-GB-RyanNeural',
        name: 'Ryan',
        language: 'en-GB',
        gender: 'male',
        description: 'Authoritative British voice',
        tier: 'pro',
        provider: 'azure',
        file: 'ryan_neural'
      },
      
      // WARRIOR TIER - Fish Audio Voices
      {
        id: 'b347db033a6549378b48d00acb0d06cd',
        name: 'Selene',
        language: 'en-US',
        gender: 'neutral',
        description: 'Natural AI voice with emotion control',
        tier: 'warrior',
        provider: 'fishaudio',
        file: 'selene_preview'
      },
      {
        id: '6ccd48c2891d409092b298dc34db0480',
        name: 'Jordan (App Creator Voice)',
        language: 'en-US',
        gender: 'male',
        description: 'Personal cloned voice',
        tier: 'warrior',
        provider: 'fishaudio',
        file: 'jordan_preview'
      },
      {
        id: 'f273648b2f6242d4bf6ede2ccc4a525a',
        name: 'Golem',
        language: 'en-US',
        gender: 'male',
        description: 'Sneak from LOTR',
        tier: 'warrior',
        provider: 'fishaudio',
        file: 'golem_preview'
      }
    ];
  }
  
  /**
   * Get a specific voice by ID
   */
  static getVoiceById(voiceId: string): VoiceOption | null {
    const voices = this.getAvailableVoices();
    return voices.find(v => v.id === voiceId) || null;
  }
  
  /**
   * Get voices available to a specific user based on their tier
   */
  static getVoicesForTier(tier: string): VoiceOption[] {
    const allVoices = this.getAvailableVoices();
    
    return allVoices.filter(voice => {
      return this.canUserUseVoice(tier, voice);
    });
  }
}