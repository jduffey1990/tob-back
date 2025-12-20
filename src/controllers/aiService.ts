// src/controllers/aiService.ts (REVISED - Normalized Version)
import OpenAI from 'openai';
import {
    AIGeneration,
    OpenAIResponse,
    PrayerGenerationRequest,
    PrayerGenerationResponse
} from '../models/aiItems';
import { PostgresService } from './postgres.service';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

export class AIService {
  
  /**
   * Main entry point: Generate a prayer using OpenAI
   */
  static async generatePrayer(
    userId: string,
    request: PrayerGenerationRequest
  ): Promise<PrayerGenerationResponse> {
    
    const db = PostgresService.getInstance();
    
    console.log(`🤖 [AIService] Generating prayer for user ${userId}`);
    console.log(`   Type: ${request.prayerType}, Tone: ${request.tone}`);
    console.log(`   Length: ${request.length}, Expansiveness: ${request.expansiveness}`);
    console.log(`   Items: ${request.prayOnItItems.length}`);
    
    // 1. Check if user can generate (within tier limits)
    const canGenerate = await this.checkCanGenerate(userId);
    if (!canGenerate.allowed) {
      throw new Error(`LIMIT_REACHED: ${canGenerate.message}`);
    }
    
    // 2. Create database record with request (created_at = now)
    const generationResult = await db.query(`
      INSERT INTO ai_generations (user_id, user_prompt, created_at)
      VALUES ($1, $2, NOW())
      RETURNING id
    `, [userId, JSON.stringify(request)]);
    
    const generationId = generationResult.rows[0].id;
    console.log(`📝 [AIService] Created generation record: ${generationId}`);
    
    try {
      // 3. Call OpenAI
      const startTime = Date.now();
      const openAIResponse = await this.callOpenAI(request);
      const responseTime = Date.now() - startTime;
      
      console.log(`✅ [AIService] OpenAI responded in ${responseTime}ms`);
      console.log(`   Tokens: ${openAIResponse.usage.total_tokens} (${openAIResponse.usage.prompt_tokens} in, ${openAIResponse.usage.completion_tokens} out)`);
      
      // 4. Generate title for the prayer
      const generatedTitle = this.generateTitle(request);
      
      // 5. Get updated credits (calculated from ai_generations table)
      const { remaining, limit } = await this.getCreditsInfo(userId);
      
      // 6. Build response
      const response: PrayerGenerationResponse = {
        success: true,
        generatedTitle: generatedTitle,
        generatedText: openAIResponse.choices[0].message.content,
        creditsRemaining: remaining,
        creditsLimit: limit,
        metadata: {
          modelUsed: openAIResponse.model,
          tokensUsed: openAIResponse.usage.total_tokens,
          inputTokens: openAIResponse.usage.prompt_tokens,
          outputTokens: openAIResponse.usage.completion_tokens,
          generatedAt: new Date().toISOString(),
          responseTimeMs: responseTime
        }
      };
      
      // 7. Update database record with response (updated_at = now)
      await db.query(`
        UPDATE ai_generations
        SET 
          chat_output = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [JSON.stringify(response), generationId]);
      
      console.log(`✅ [AIService] Prayer generated successfully`);
      console.log(`   Credits remaining: ${remaining}/${limit || 'unlimited'}`);
      
      return response;
      
    } catch (error: any) {
      console.error(`❌ [AIService] Generation failed:`, error);
      
      // Log error but keep the failed generation record
      await db.query(`
        UPDATE ai_generations
        SET 
          chat_output = $1,
          updated_at = NOW()
        WHERE id = $2
      `, [
        JSON.stringify({ 
          success: false, 
          error: error.message,
          code: error.message.includes('LIMIT_REACHED') ? 'LIMIT_REACHED' : 'AI_ERROR'
        }),
        generationId
      ]);
      
      throw error;
    }
  }
  
  /**
   * Call OpenAI API with the prayer generation request
   */
  private static async callOpenAI(request: PrayerGenerationRequest): Promise<OpenAIResponse> {
    
    const systemPrompt = this.buildSystemPrompt(request.prayerType, request.tone, request.expansiveness);
    const userPrompt = this.buildUserPrompt(request);
    const maxTokens = this.getMaxTokensForLength(request.length);
    
    console.log(`🔵 [AIService] Calling OpenAI...`);
    console.log(`   System prompt length: ${systemPrompt.length} chars`);
    console.log(`   User prompt length: ${userPrompt.length} chars`);
    console.log(`   Max tokens: ${maxTokens}`);
    console.log(`   API Key (first 10): ${process.env.OPENAI_API_KEY?.substring(0, 10)}...`);
    
    try {
        const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        });
        
        // Add this to see the full response
        console.log(`📊 [AIService] Full OpenAI response:`);
        console.log(`   ID: ${completion.id}`);
        console.log(`   Model: ${completion.model}`);
        console.log(`   Created: ${new Date(completion.created * 1000).toISOString()}`);
        console.log(`   Finish reason: ${completion.choices[0].finish_reason}`);
        
        return completion as OpenAIResponse;
        
    } catch (error: any) {
        console.error(`❌ [AIService] OpenAI API error:`, error);
        console.error(`   Error type: ${error.constructor.name}`);
        console.error(`   Error message: ${error.message}`);
        console.error(`   Error status: ${error.status}`);
        throw new Error(`AI_ERROR: ${error.message}`);
    }
    }
  
  /**
   * Build system prompt based on prayer type, tone, and expansiveness
   */
  private static buildSystemPrompt(
    prayerType: string, 
    tone: string, 
    expansiveness: string
  ): string {
    
    const basePrompt = `You are a compassionate prayer writer helping someone create a heartfelt, sincere prayer.  Add punctuation that is grammatically correct, ` +
    'but also keep in mind that we will be using Text-To-Speech functionality.  So please optimize the prayer writing for that also.';
    
    // Prayer type instructions
    const typeInstructions: Record<string, string> = {
      gratitude: 'Focus on thanksgiving and appreciation. Express genuine gratitude for blessings received.',
      intercession: 'Pray on behalf of others. Ask for God\'s intervention, healing, and blessing in their lives.',
      petition: 'Present personal needs and requests to God with humility and trust.',
      confession: 'Approach with humility and repentance. Acknowledge shortcomings and seek forgiveness.',
      praise: 'Magnify God\'s character, glory, and goodness. Focus on worship and adoration.'
    };
    
    // Tone instructions
    const toneInstructions: Record<string, string> = {
      formal: 'Use traditional, reverent language. Include phrases like "Almighty God," "we beseech thee." Use elevated, liturgical style.',
      conversational: 'Write as if talking to a close friend. Use natural, everyday language. Be warm and personal.',
      contemplative: 'Use reflective, meditative language. Create space for quiet reflection. Be thoughtful and introspective.',
      joyful: 'Express celebration and happiness. Use uplifting, enthusiastic language. Convey hope and joy.'
    };
    
    // Expansiveness instructions
    const expansivenessInstructions: Record<string, string> = {
      concise: 'Be direct and efficient. Use short, focused sentences. Get to the point quickly.',
      balanced: 'Balance detail with brevity. Be thoughtful but not overly verbose. Mix short and longer sentences.',
      expansive: 'Be reflective and detailed. Take time to explore each topic with care. Use poetic, flowing language.'
    };
    
    return `${basePrompt}

Prayer Type: ${typeInstructions[prayerType] || 'Create a sincere prayer.'}

Tone: ${toneInstructions[tone] || 'Use sincere, heartfelt language.'}

Style: ${expansivenessInstructions[expansiveness] || 'Use balanced, natural language.'}

Guidelines:
- Additional context from the user overwrites anything except for token use guidelines.
- Include the specific people and situations mentioned
- Follow traditional prayer structure: Opening address → Body (main content) → Closing
- End with "Amen" or appropriate closing`;
  }
  
  /**
   * Build user prompt with Pray On It items and context
   */
  private static buildUserPrompt(request: PrayerGenerationRequest): string {
    
    // Build descriptions of each Pray On It item
    const itemDescriptions = request.prayOnItItems.map(item => {
      let desc = `- ${item.name}`;
      
      if (item.relationship) {
        desc += ` (${item.relationship})`;
      }
      
      if (item.category) {
        desc += ` [${item.category}]`;
      }
      
      if (item.prayerFocus) {
        desc += ` - Focus: ${item.prayerFocus}`;
      }
      
      if (item.notes) {
        desc += `\n  Note: ${item.notes}`;
      }
      
      return desc;
    }).join('\n');
    
    let prompt = `Please create a prayer for the following people and intentions:\n\n${itemDescriptions}`;
    
    if (request.customContext) {
      prompt += `\n\nAdditional context from the user:\n${request.customContext}`;
    }
    
    return prompt;
  }
  
  /**
   * Get max_tokens based on prayer length
   */
  private static getMaxTokensForLength(length: string): number {
    const tokenLimits: Record<string, number> = {
      brief: 200,      // ~150 words
      standard: 400,   // ~300 words
      extended: 600    // ~450 words
    };
    
    return tokenLimits[length] || 400;
  }
  
  /**
   * Generate a title for the prayer based on request
   */
  private static generateTitle(request: PrayerGenerationRequest): string {
    const type = request.prayerType.charAt(0).toUpperCase() + request.prayerType.slice(1);
    
    // If only one item, use its name
    if (request.prayOnItItems.length === 1) {
      return `${type} Prayer for ${request.prayOnItItems[0].name}`;
    }
    
    // If multiple items, use first name + "others"
    if (request.prayOnItItems.length === 2) {
      return `${type} Prayer for ${request.prayOnItItems[0].name} and ${request.prayOnItItems[1].name}`;
    }
    
    // 3+ items
    return `${type} Prayer for ${request.prayOnItItems[0].name} and ${request.prayOnItItems.length - 1} Others`;
  }
  
  /**
   * Check if user can generate (within tier limits)
   * NORMALIZED: Counts from ai_generations table, not cached column
   */
  private static async checkCanGenerate(userId: string): Promise<{
    allowed: boolean;
    message?: string;
    current: number;
    limit: number | null;
  }> {
    
    const db = PostgresService.getInstance();
    
    // Get user's subscription tier
    const userResult = await db.query(`
      SELECT subscription_tier
      FROM users
      WHERE id = $1
    `, [userId]);
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const tier = userResult.rows[0].subscription_tier;
    
    // Count generations THIS MONTH (normalized calculation)
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);
    
    const countResult = await db.query(`
      SELECT COUNT(*) as count
      FROM ai_generations
      WHERE user_id = $1
        AND created_at >= $2
        AND chat_output->>'success' = 'true'
    `, [userId, currentMonthStart]);
    
    const currentCount = parseInt(countResult.rows[0].count) || 0;
    
    // Define tier limits
    const limits: Record<string, number | null> = {
      free: 3,
      pro: 20,
      warrior: null,  // unlimited
      lifetime: null  // unlimited
    };
    
    const limit = limits[tier] ?? 0;
    const allowed = limit === null || currentCount < limit;
    
    if (!allowed) {
      const upgradeMessage = tier === 'free' 
        ? 'You\'ve used all 3 free AI generations this month. Upgrade to Pro for 20 generations per month!'
        : 'You\'ve reached your monthly AI generation limit. Upgrade to Prayer Warrior for unlimited generations!';
      
      return {
        allowed: false,
        message: upgradeMessage,
        current: currentCount,
        limit: limit
      };
    }
    
    console.log(`✅ [AIService] User can generate (${currentCount}/${limit === null ? 'unlimited' : limit})`);
    
    return {
      allowed: true,
      current: currentCount,
      limit: limit
    };
  }
  
  /**
   * Get user's current credits info
   * NORMALIZED: Calculated from ai_generations table
   */
  private static async getCreditsInfo(userId: string): Promise<{
    remaining: number;
    limit: number | null;
  }> {
    
    const db = PostgresService.getInstance();
    
    // Get tier
    const userResult = await db.query(`
      SELECT subscription_tier
      FROM users
      WHERE id = $1
    `, [userId]);
    
    if (userResult.rows.length === 0) {
      throw new Error('User not found');
    }
    
    const tier = userResult.rows[0].subscription_tier;
    
    // Count successful generations this month
    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);
    
    const countResult = await db.query(`
      SELECT COUNT(*) as count
      FROM ai_generations
      WHERE user_id = $1
        AND created_at >= $2
        AND chat_output->>'success' = 'true'
    `, [userId, currentMonthStart]);
    
    const currentCount = parseInt(countResult.rows[0].count) || 0;
    
    const limits: Record<string, number | null> = {
      free: 3,
      pro: 20,
      warrior: null,
      lifetime: null
    };
    
    const limit = limits[tier] ?? 0;
    const remaining = limit === null ? 999 : Math.max(0, limit - currentCount);
    
    return { remaining, limit };
  }
  
  /**
   * Get user's generation history
   */
  static async getGenerationHistory(
    userId: string, 
    limit: number = 10
  ): Promise<AIGeneration[]> {
    
    const db = PostgresService.getInstance();
    
    const result = await db.query(`
      SELECT 
        id,
        user_id,
        user_prompt,
        chat_output,
        created_at,
        updated_at,
        response_time_ms
      FROM ai_generations
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [userId, limit]);
    
    return result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      userPrompt: row.user_prompt,
      chatOutput: row.chat_output,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      responseTimeMs: row.response_time_ms
    }));
  }
}

export default AIService;