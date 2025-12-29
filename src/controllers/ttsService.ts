// src/controllers/ttsService.ts
import axios from 'axios';
import { PostgresService } from './postgres.service';
import {
  TTSRequest,
  TTSResponse,
  TTSError,
  VoiceOption 
} from '../models/ttsItems'

// ============================================
// TTS Service
// ============================================

export class TTSService {
  
  /**
   * Main entry point: Generate audio for a prayer
   */
  static async generateAudio(request: TTSRequest): Promise<TTSResponse> {
    const db = PostgresService.getInstance();
    
    console.log(`🎙️ [TTSService] Generating audio for prayer ${request.prayerId}`);
    console.log(`   Voice: ${request.voiceId}`);
    console.log(`   Text length: ${request.text.length} characters`);
    
    // 1. Get user's subscription tier
    const userResult = await db.query(
      'SELECT subscription_tier FROM users WHERE id = $1',
      [request.userId]
    );
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const tier = userResult.rows[0].subscription_tier;
    console.log(`   User tier: ${tier}`);
    
    // 2. Validate voice is allowed for this tier
    const voice = this.getVoiceById(request.voiceId);
    if (!voice) {
      throw new Error(`INVALID_VOICE: Voice ${request.voiceId} not found`);
    }
    
    if (!this.canUserUseVoice(tier, voice)) {
      throw new Error(`INVALID_TIER: Voice ${voice.name} requires ${voice.tier} tier or higher`);
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
          
        case 'speechify':
          ({ audioData, estimatedCost } = await this.generateSpeechifyTTS(request.text, voice));
          break;
          
        default:
          throw new Error(`Unknown provider: ${voice.provider}`);
      }
      
      const responseTime = Date.now() - startTime;
      
      console.log(`✅ [TTSService] Audio generated in ${responseTime}ms`);
      console.log(`   Characters: ${request.text.length}`);
      console.log(`   Estimated cost: $${estimatedCost.toFixed(4)}`);
      
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
      throw new Error('Azure TTS API key not configured');
    }
    
    console.log(`🔵 [TTSService] Calling Azure TTS...`);
    console.log(`   Region: ${azureRegion}`);
    console.log(`   Voice: ${voice.id}`);
    console.log(`   API Key (first 10): ${azureKey.substring(0, 10)}...`);
    
    try {
      // Azure TTS API endpoint
      const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
      
      // Build SSML (Speech Synthesis Markup Language)
      const ssml = `
        <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">
          <voice name="${voice.id}">
            ${text}
          </voice>
        </speak>
      `.trim();
      
      // Call Azure API
      const response = await axios.post(url, ssml, {
        headers: {
          'Ocp-Apim-Subscription-Key': azureKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
        },
        responseType: 'arraybuffer'
      });
      
      // Convert binary audio to base64
      const audioData = Buffer.from(response.data).toString('base64');
      
      // Calculate cost: Azure charges $4-16 per 1M characters
      // Using $10/1M as average
      const estimatedCost = (text.length / 1_000_000) * 10;
      
      console.log(`✅ [TTSService] Azure TTS successful`);
      console.log(`   Audio size: ${audioData.length} bytes (base64)`);
      
      return { audioData, estimatedCost };
      
    } catch (error: any) {
      console.error(`❌ [TTSService] Azure API error:`, error.response?.data || error.message);
      throw new Error(`API_ERROR: ${error.message}`);
    }
  }
  
  /**
   * Generate audio using Speechify TTS API
   */
  private static async generateSpeechifyTTS(
    text: string,
    voice: VoiceOption
  ): Promise<{ audioData: string; estimatedCost: number }> {
    
    const speechifyKey = process.env.SPEECHIFY_API_KEY;
    
    if (!speechifyKey) {
      throw new Error('Speechify API key not configured');
    }
    
    console.log(`🟣 [TTSService] Calling Speechify TTS...`);
    console.log(`   Voice: ${voice.id}`);
    console.log(`   API Key (first 10): ${speechifyKey.substring(0, 10)}...`);
    
    try {
      // Speechify API endpoint (you'll need to update this with actual endpoint)
      const url = 'https://api.sws.speechify.com/v1/audio/speech';
      
      // Call Speechify API
      const response = await axios.post(url, {
        audio_format: 'mp3',
        input: text,
        voice_id: voice.id,
        model: 'simba-multilingual'  // Their standard model
      }, {
        headers: {
          'Authorization': `Bearer ${speechifyKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      });
      
      // Convert binary audio to base64
      const audioData = Buffer.from(response.data).toString('base64');
      
      // Calculate cost: Speechify charges $10 per 1M characters
      const estimatedCost = (text.length / 1_000_000) * 10;
      
      console.log(`✅ [TTSService] Speechify TTS successful`);
      console.log(`   Audio size: ${audioData.length} bytes (base64)`);
      
      return { audioData, estimatedCost };
      
    } catch (error: any) {
      console.error(`❌ [TTSService] Speechify API error:`, error.response?.data || error.message);
      throw new Error(`API_ERROR: ${error.message}`);
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
   * Get all available voices (for GET /voices endpoint)
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
        provider: 'azure'
      },
      {
        id: 'en-US-GuyNeural',
        name: 'Guy',
        language: 'en-US',
        gender: 'male',
        description: 'Professional American voice',
        tier: 'pro',
        provider: 'azure'
      },
      {
        id: 'en-GB-SoniaNeural',
        name: 'Sonia',
        language: 'en-GB',
        gender: 'female',
        description: 'Clear British voice',
        tier: 'pro',
        provider: 'azure'
      },
      {
        id: 'en-GB-RyanNeural',
        name: 'Ryan',
        language: 'en-GB',
        gender: 'male',
        description: 'Authoritative British voice',
        tier: 'pro',
        provider: 'azure'
      },
      {
        id: 'en-AU-NatashaNeural',
        name: 'Natasha',
        language: 'en-AU',
        gender: 'female',
        description: 'Australian English voice',
        tier: 'pro',
        provider: 'azure'
      },
      {
        id: 'en-AU-WilliamNeural',
        name: 'William',
        language: 'en-AU',
        gender: 'male',
        description: 'Australian English voice',
        tier: 'pro',
        provider: 'azure'
      },
      
      // WARRIOR TIER - Speechify Voices
      {
        id: 'george',
        name: 'George',
        language: 'en-US',
        gender: 'male',
        description: 'Deep, warm male voice',
        tier: 'warrior',
        provider: 'speechify'
      },
      {
        id: 'henry',
        name: 'Henry',
        language: 'en-US',
        gender: 'male',
        description: 'Energetic, youthful voice',
        tier: 'warrior',
        provider: 'speechify'
      },
      {
        id: 'mia',
        name: 'Mia',
        language: 'en-US',
        gender: 'female',
        description: 'Calm, soothing voice',
        tier: 'warrior',
        provider: 'speechify'
      },
      {
        id: 'snoop',
        name: 'Snoop (Snoop Dogg)',
        language: 'en-US',
        gender: 'male',
        description: 'Iconic celebrity voice',
        tier: 'warrior',
        provider: 'speechify'
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