//
// AI Prayer Generation Models
// src/models/aiItems.ts
//

// ============================================
// Database Model (ai_generations table)
// ============================================

export interface AIGeneration {
  id: string;                           // uuid
  userId: string;                       // uuid - foreign key to users table
  
  // Request data (what user submitted)
  userPrompt: PrayerGenerationRequest;  // JSONB column
  
  // Response data (what OpenAI returned)
  chatOutput: PrayerGenerationResponse | null;  // JSONB column (null until response received)
  
  // Timestamps
  createdAt: Date;                      // When user submitted prompt
  updatedAt: Date;                      // When OpenAI response received
  
  // Derived metrics (optional - can calculate from timestamps)
  responseTimeMs?: number;              // updatedAt - createdAt in milliseconds
}

// ============================================
// Request Model (matches iOS payload)
// ============================================

export interface PrayerGenerationRequest {
  // Full Pray On It item objects (not just IDs!)
  prayOnItItems: PrayOnItItemPayload[];
  
  // Prayer settings
  prayerType: PrayerType;
  tone: PrayerTone;
  length: PrayerLength;
  
  // Optional context
  customContext?: string | null;
}

// Pray On It item as sent from iOS
export interface PrayOnItItemPayload {
  id: string;                           // uuid
  name: string;
  category: string;                     // 'family' | 'friends' | 'work' | etc.
  relationship?: string | null;         // 'mother', 'friend', etc.
  prayerFocus?: string | null;          // 'healing', 'guidance', etc.
  notes?: string | null;
}

// Enums
export type PrayerType = 'gratitude' | 'intercession' | 'petition' | 'confession' | 'praise';
export type PrayerTone = 'formal' | 'conversational' | 'contemplative' | 'joyful';
export type PrayerLength = 'brief' | 'standard' | 'extended';

// ============================================
// Response Model (what we return to iOS)
// ============================================

export interface PrayerGenerationResponse {
  success: true;
  generatedTitle: string;               // prayers saved have titles too
  generatedText: string;                // The AI-generated prayer
  creditsRemaining: number | null;      // ✅ FIXED: null = unlimited
  creditsLimit: number | null;          // null = unlimited
  creditsPeriod?: 'daily' | 'monthly';  // ✅ NEW: for UI display
  
  metadata: {
    modelUsed: string;                  // e.g., "gpt-4o-mini"
    tokensUsed: number;                 // Total tokens (input + output)
    inputTokens: number;                // Input tokens only
    outputTokens: number;               // Output tokens only
    generatedAt: string;                // ISO timestamp
    responseTimeMs: number;             // How long generation took
  };
}

// Error response
export interface PrayerGenerationError {
  success: false;
  error: string;
  code: 'LIMIT_REACHED' | 'INVALID_INPUT' | 'AI_ERROR' | 'SERVER_ERROR';
  creditsRemaining?: number | null;     // ✅ FIXED: Allow null here too
}

// ============================================
// OpenAI Response Model (what we get from OpenAI)
// ============================================

// This is what OpenAI actually returns
// Reference: https://platform.openai.com/docs/api-reference/chat/create
export interface OpenAIResponse {
  id: string;                           // e.g., "chatcmpl-123"
  object: string;                       // "chat.completion"
  created: number;                      // Unix timestamp
  model: string;                        // "gpt-4o-mini"
  
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;                  // The generated prayer text
    };
    finish_reason: 'stop' | 'length' | 'content_filter' | null;
  }>;
  
  usage: {
    prompt_tokens: number;              // Input tokens
    completion_tokens: number;          // Output tokens
    total_tokens: number;               // Total
  };
}

export default AIGeneration;