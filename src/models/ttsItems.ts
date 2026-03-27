// ttsItems.ts

export interface TTSRequest {
  prayerId: string;
  text: string;
  voiceId: string;
  userId: string;
}

export interface TTSResponse {
  success: true;
  audioData: string;        // base64-encoded MP3
  audioFormat: 'mp3';
  voiceUsed: string;
  provider: 'apple' | 'azure' | 'fishaudio'; // | 'cartesia' — commented out, may revisit
  metadata: {
    characterCount: number;
    estimatedCost: number;  // in USD
    generatedAt: string;
    responseTimeMs: number;
  };
}

export interface TTSError {
  success: false;
  error: string;
  code: 'INVALID_TIER' | 'API_ERROR' | 'SERVER_ERROR' | 'INVALID_VOICE';
}

export interface VoiceOption {
  id: string;
  name: string;
  language: string;
  gender?: 'male' | 'female' | 'neutral';
  description?: string;
  tier: 'free' | 'pro' | 'prayer_warrior';
  provider: 'apple' | 'azure' | 'fishaudio'; // | 'cartesia' — commented out, may revisit
  previewUrl?: string | null;
  previewText?: string;
  isActive: boolean;
  sortOrder: number;
}