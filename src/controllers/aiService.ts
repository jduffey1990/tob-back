// src/controllers/aiService.ts (REVISED - Daily Limits for Prayer Warrior + Denomination Support + Instruction Ranking)
import OpenAI from 'openai';
import {
  AIGeneration,
  OpenAIResponse,
  PrayerGenerationRequest,
  PrayerGenerationResponse
} from '../models/aiItems';
import { PostgresService } from './postgres.service';
import { UserService } from './userService'; // NEW: Import UserService

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
  
    
    // NEW: Fetch user to get denomination
    const user = await UserService.findUserById(userId);
    const userDenomination = user?.denomination || 'Christian';  // Fallback to Christian if not found
    
    // NEW: Detect denomination override from customContext
    const denominationOverride = this.detectDenominationOverride(request.customContext);
    const effectiveDenomination = denominationOverride || userDenomination;
    
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
    
    try {
      // 3. Call OpenAI with effective denomination (might be overridden)
      const startTime = Date.now();
      const openAIResponse = await this.callOpenAI(request, effectiveDenomination, denominationOverride !== null);
      const responseTime = Date.now() - startTime;
      
      // 4. Generate title for the prayer
      const generatedTitle = this.generateTitle(request);
      
      // 5. Get updated credits (calculated from ai_generations table)
      const { remaining, limit, period } = await this.getCreditsInfo(userId);
      
      // 6. Build response
      const response: PrayerGenerationResponse = {
        success: true,
        generatedTitle: generatedTitle,
        generatedText: openAIResponse.choices[0].message.content,
        creditsRemaining: remaining,
        creditsLimit: limit,
        creditsPeriod: period, // 'daily' or 'monthly'
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
   * NEW: Detect if user's customContext requests a different denomination
   * Returns the denomination string if detected, null otherwise
   */
  private static detectDenominationOverride(customContext?: string | null): string | null {
    if (!customContext) return null;
    
    const lowerContext = customContext.toLowerCase();
    
    // Map of detection patterns to denomination names
    const denominationPatterns: Array<{ pattern: RegExp; denomination: string }> = [
      // Christianity - specific denominations
      { pattern: /\b(catholic|roman catholic)\b/i, denomination: 'Roman Catholic' },
      { pattern: /\b(orthodox|eastern orthodox)\b/i, denomination: 'Eastern Orthodox' },
      { pattern: /\b(anglican|episcopal)\b/i, denomination: 'Anglican/Episcopal' },
      { pattern: /\b(baptist)\b/i, denomination: 'Baptist' },
      { pattern: /\b(lutheran)\b/i, denomination: 'Lutheran' },
      { pattern: /\b(methodist)\b/i, denomination: 'Methodist' },
      { pattern: /\b(presbyterian)\b/i, denomination: 'Presbyterian' },
      { pattern: /\b(pentecostal)\b/i, denomination: 'Pentecostal' },
      { pattern: /\b(mormon|latter-day saints?|lds)\b/i, denomination: 'Latter-day Saints (Mormon)' },
      
      // Generic Christian
      { pattern: /\b(christian|christianity)\b/i, denomination: 'Christian' },
      
      // Judaism
      { pattern: /\b(jewish|judaism|hebrew)\b/i, denomination: 'Orthodox Judaism' },
      
      // Islam
      { pattern: /\b(islam|muslim|islamic)\b/i, denomination: 'Sunni Islam' },
      
      // Buddhism
      { pattern: /\b(buddhist|buddhism)\b/i, denomination: 'Buddhism - Mahayana' },
      
      // Hinduism
      { pattern: /\b(hindu|hinduism)\b/i, denomination: 'Hinduism' },
      
      // Other religions
      { pattern: /\b(sikh|sikhism)\b/i, denomination: 'Sikhism' },
      { pattern: /\b(tao|taoist|taoism)\b/i, denomination: 'Taoism' },
    ];
    
    // Check each pattern
    for (const { pattern, denomination } of denominationPatterns) {
      if (pattern.test(lowerContext)) {
        console.log(`📋 [AIService] Detected denomination override in context: ${denomination}`);
        return denomination;
      }
    }
    
    return null;
  }
  
  /**
   * Call OpenAI API with the prayer generation request
   */
  private static async callOpenAI(
    request: PrayerGenerationRequest,
    denomination: string,  // NEW: Accept denomination
    isDenominationOverride: boolean = false  // NEW: Flag if this is an override
  ): Promise<OpenAIResponse> {
    
    const systemPrompt = this.buildSystemPrompt(
      request.prayerType, 
      request.tone, 
      denomination,
      isDenominationOverride
    );
    const userPrompt = this.buildUserPrompt(request);
    const maxTokens = this.getMaxTokensForLength(request.length);
    
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
        
        return completion as OpenAIResponse;
        
    } catch (error: any) {
        console.error(`❌ [AIService] OpenAI API error:`, error);
        console.error(`   Error type: ${error.constructor.name}`);
        console.error(`   Error message: ${error.message}`);
        throw new Error(`AI_ERROR: ${error.message}`);
    }
  }
  
  /**
   * Build system prompt based on prayer type, tone, and denomination
   * NEW: Includes instruction ranking/priority system
   */
  private static buildSystemPrompt(
    prayerType: string, 
    tone: string,
    denomination: string,
    isDenominationOverride: boolean = false
  ): string {
    
    // NEW: Instruction Priority/Ranking System
    const priorityRules = `
      INSTRUCTION PRIORITY HIERARCHY (Highest → Lowest):
      1. HARD CONSTRAINTS: You must NEVER exceed the token limit. This is non-negotiable.
      2. USER CONTEXT: If the user's additional context contradicts their profile denomination or settings, honor their context.
      3. USER SETTINGS: Respect the prayer type, tone, and length settings.
      ${isDenominationOverride ? '4. User requested different tradition - honor it' : ''}`;
    
    // Base prompt now includes denomination and priority rules
    const basePrompt = `You are a prayer writer. Generate in ${denomination} style. ${this.getDenominationGuidance(denomination)}

    ${priorityRules}

    Use clear punctuation optimized for Text-To-Speech.`;
  
    // Prayer type instructions
    const typeInstructions: Record<string, string> = {
      gratitude: 'Focus on giving thanks and appreciation.',
      intercession: `Pray on behalf of others. Ask for ${denomination}'s supreme being in their lives.`,
      petition: `Present personal needs and requests to ${denomination}'s supreme being with humility and trust.`,
      confession: 'Approach with humility and repentance. Acknowledge shortcomings and seek forgiveness.',
      praise: `Magnify ${denomination}'s supreme being's character, glory, and goodness. Focus on worship and adoration.`
    };
    
    // Tone instructions
    const toneInstructions: Record<string, string> = {
      formal: 'Use traditional, reverent language. Use elevated, liturgical style.',
      conversational: 'Write as if talking to a close friend. Be warm and personal.',
      contemplative: 'Use reflective, meditative language. Be thoughtful and introspective.',
      joyful: 'Express celebration and happiness. Use uplifting, enthusiastic language. Convey hope and joy.'
    };
    
    return `${basePrompt}

    Prayer Type: ${typeInstructions[prayerType] || 'Create a sincere prayer.'}

    Tone: ${toneInstructions[tone] || 'Use sincere, heartfelt language.'}

    Guidelines:
    - Use ${denomination} theological/liturgical style
    - Include all people/situations mentioned
    - Structure: Opening → Body → Closing
    - End with appropriate closing for ${denomination}`;
  }
  
  /**
   * NEW: Get denomination-specific guidance for prayer generation
   * UPDATED: Now includes AI adaptation fallback for unknown denominations
   */
  private static getDenominationGuidance(denomination: string): string {
    const lowerDenom = denomination.toLowerCase();
    
    // Christianity - Catholic
    if (lowerDenom === 'roman catholic' || lowerDenom === 'catholic') {
      return 'Use traditional Catholic prayer language. May reference saints, Mary, or the Trinity. Consider formal liturgical structure. May include phrases like "Holy Mother" or "Blessed Virgin."';
    }
    
    // Christianity - Eastern Orthodox
    if (lowerDenom === 'eastern orthodox' || lowerDenom.includes('orthodox') && !lowerDenom.includes('jewish')) {
      return 'Use Eastern Orthodox prayer language. May reference icons, the Theotokos (Mother of God), and Orthodox theological concepts. Consider using "Lord have mercy" (Kyrie eleison).';
    }
    
    // Christianity - Protestant (various) - exact matches first
    if (lowerDenom === 'baptist') {
      return 'Use Baptist prayer language. Scripture-focused, emphasizing personal relationship with God and believer\'s baptism. Direct, accessible language.';
    }
    
    if (lowerDenom === 'lutheran') {
      return 'Use Lutheran prayer language. Emphasize grace, scripture, and sacraments. May draw from Lutheran liturgical traditions.';
    }
    
    if (lowerDenom === 'methodist') {
      return 'Use Methodist prayer language. Focus on personal holiness, social justice, and God\'s grace. Warm, accessible style.';
    }
    
    if (lowerDenom === 'presbyterian') {
      return 'Use Presbyterian prayer language. Emphasize God\'s sovereignty and Reformed theology. Thoughtful, structured approach.';
    }
    
    // Broader Protestant match
    if (lowerDenom.includes('protestant')) {
      return 'Use Protestant prayer language. Scripture-focused, emphasizing personal relationship with God. May reference Jesus directly. Use accessible, biblical language.';
    }
    
    // Christianity - Anglican/Episcopal
    if (lowerDenom.includes('anglican') || lowerDenom.includes('episcopal')) {
      return 'Use Anglican prayer language. Blend traditional liturgical elements with accessible language. May draw from Book of Common Prayer style.';
    }
    
    // Christianity - Pentecostal
    if (lowerDenom.includes('pentecostal')) {
      return 'Use Pentecostal prayer language. May be more expressive and emotional. Reference the Holy Spirit prominently. Use passionate, heartfelt language.';
    }
    
    // Christianity - Latter-day Saints
    if (lowerDenom.includes('latter-day') || lowerDenom.includes('mormon')) {
      return 'Use LDS prayer language. Begin with "Heavenly Father" and close with "in the name of Jesus Christ." Use reverent, respectful tone.';
    }
    
    // Christianity - Non-denominational
    if (lowerDenom.includes('non-denominational')) {
      return 'Use accessible, contemporary Christian language. Focus on personal relationship with God. Avoid denominational-specific terminology.';
    }
    
    // Generic Christian fallback
    if (lowerDenom === 'christian' || lowerDenom.includes('christian')) {
      return 'Use general Christian prayer language. Scripture-based, accessible, and heartfelt. Focus on relationship with God through Jesus Christ.';
    }
    
    // Judaism
    if (lowerDenom.includes('jewish') || lowerDenom.includes('judaism')) {
      return 'Use Jewish prayer language. Reference Hashem, Adonai, or HaShem. May include Hebrew phrases like "Baruch Atah Adonai" (Blessed are You, Lord). Avoid Christian terminology entirely.';
    }
    
    // Islam
    if (lowerDenom.includes('islam') || lowerDenom.includes('muslim') || lowerDenom.includes('sunni') || lowerDenom.includes('shia')) {
      return 'Use Islamic prayer language (dua style). Reference Allah. May include Arabic phrases like "Bismillah" (In the name of Allah) or "Alhamdulillah" (Praise be to Allah). Follow Islamic prayer conventions.';
    }
    
    // Buddhism
    if (lowerDenom.includes('buddhis')) {
      return 'Use Buddhist prayer/chant language. Focus on mindfulness, compassion (metta), and enlightenment. May reference the dharma, sangha, or Buddha. Avoid theistic language.';
    }
    
    // Hinduism
    if (lowerDenom.includes('hindu')) {
      return 'Use Hindu prayer language. May reference deities like Brahma, Vishnu, Shiva, or others. Can include mantras or references to dharma. Use respectful, devotional (bhakti) style.';
    }
    
    // Sikhism
    if (lowerDenom.includes('sikh')) {
      return 'Use Sikh prayer language. Reference Waheguru (Wonderful Lord). May include phrases from Sikh scripture. Focus on unity with divine and service to humanity.';
    }
    
    // Taoism
    if (lowerDenom.includes('tao')) {
      return 'Use Taoist prayer language. Focus on harmony, balance, and the Way (Tao). Use contemplative, nature-inspired language. Avoid aggressive or demanding tone.';
    }
    
    // Bahá'í Faith
    if (lowerDenom.includes('bahá')) {
      return 'Use Bahá\'í prayer language. May reference God\'s attributes. Focus on unity, service, and spiritual growth. Use respectful, inclusive language.';
    }
    
    // Unitarian Universalist
    if (lowerDenom.includes('unitarian')) {
      return 'Use Unitarian Universalist language. Highly inclusive, may avoid specific deity references. Focus on shared values, community, and personal spiritual journey.';
    }
    
    // Spiritual but not religious
    if (lowerDenom.includes('spiritual')) {
      return 'Use spiritual but non-religious language. Focus on intention, mindfulness, and connection. Avoid specific religious terminology. Use universal, inclusive language.';
    }
    
    // Atheist / None
    if (lowerDenom.includes('atheist') || lowerDenom === 'none') {
      return 'Use secular, reflective language. Focus on hope, intention, gratitude, and mindfulness without religious references. Frame as personal reflection or expression of values rather than prayer to a deity.';
    }
    
    // NEW: AI adaptation fallback for unknown/custom denominations
    return `The user identifies as "${denomination}". Research and adapt to this spiritual tradition's authentic prayer style and language. Use respectful, sincere language appropriate for their beliefs. If uncertain, default to universal, inclusive, heartfelt language.`;
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
    
    // Handle empty prayOnItItems (custom context only)
    if (!request.prayOnItItems || request.prayOnItItems.length === 0) {
      return `${type} Prayer`;  // Simple title when no specific people mentioned
    }
    
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
   * Prayer Warrior: 3 per DAY (rolls over daily)
   * Other tiers: monthly limits
   */
  static async checkCanGenerate(userId: string): Promise<{
    allowed: boolean;
    message?: string;
    current: number;
    limit: number | null;
    period: 'daily' | 'monthly';
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
    
    // Define tier limits and periods
    const tierConfig: Record<string, { limit: number | null; period: 'daily' | 'monthly' }> = {
      free: { limit: 3, period: 'monthly' },
      pro: { limit: 20, period: 'monthly' },
      prayer_warrior: { limit: 3, period: 'daily' },  // ⭐ Daily rollover!
      lifetime: { limit: null, period: 'monthly' }    // Unlimited
    };
    
    const config = tierConfig[tier] || { limit: 0, period: 'monthly' };
    
    // Calculate time window based on period
    let timeWindowStart: Date;
    if (config.period === 'daily') {
      // Start of current day (midnight)
      timeWindowStart = new Date();
      timeWindowStart.setHours(0, 0, 0, 0);
    } else {
      // Start of current month
      timeWindowStart = new Date();
      timeWindowStart.setDate(1);
      timeWindowStart.setHours(0, 0, 0, 0);
    }
    
    // Count successful generations in this period
    const countResult = await db.query(`
      SELECT COUNT(*) as count
      FROM ai_generations
      WHERE user_id = $1
        AND created_at >= $2
        AND chat_output->>'success' = 'true'
    `, [userId, timeWindowStart]);
    
    const currentCount = parseInt(countResult.rows[0].count) || 0;
    
    // Check if allowed
    const allowed = config.limit === null || currentCount < config.limit;
    
    if (!allowed) {
      let upgradeMessage: string;
      
      if (tier === 'free') {
        upgradeMessage = 'You\'ve used all 3 free AI generations this month. Upgrade to Pro for 20 per month!';
      } else if (tier === 'pro') {
        upgradeMessage = 'You\'ve used all 20 AI generations this month. Upgrade to Prayer Warrior for 3 daily generations!';
      } else if (tier === 'prayer_warrior') {
        upgradeMessage = 'You\'ve used all 3 AI generations today. They\'ll refresh tomorrow!';
      } else {
        upgradeMessage = 'AI generation limit reached.';
      }
      
      return {
        allowed: false,
        message: upgradeMessage,
        current: currentCount,
        limit: config.limit,
        period: config.period
      };
    }
    
    return {
      allowed: true,
      current: currentCount,
      limit: config.limit,
      period: config.period
    };
  }
  
  /**
   * Get user's current AI credits info
   * Includes period (daily vs monthly) for UI display
   */
  private static async getCreditsInfo(userId: string): Promise<{
    remaining: number | null;
    limit: number | null;
    period: 'daily' | 'monthly';
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
    
    // Define tier config
    const tierConfig: Record<string, { limit: number | null; period: 'daily' | 'monthly' }> = {
      free: { limit: 3, period: 'monthly' },
      pro: { limit: 20, period: 'monthly' },
      prayer_warrior: { limit: 3, period: 'daily' },
      lifetime: { limit: null, period: 'monthly' }
    };
    
    const config = tierConfig[tier] || { limit: 0, period: 'monthly' };
    
    // Calculate time window
    let timeWindowStart: Date;
    if (config.period === 'daily') {
      timeWindowStart = new Date();
      timeWindowStart.setHours(0, 0, 0, 0);
    } else {
      timeWindowStart = new Date();
      timeWindowStart.setDate(1);
      timeWindowStart.setHours(0, 0, 0, 0);
    }
    
    // Count successful generations in this period
    const countResult = await db.query(`
      SELECT COUNT(*) as count
      FROM ai_generations
      WHERE user_id = $1
        AND created_at >= $2
        AND chat_output->>'success' = 'true'
    `, [userId, timeWindowStart]);
    
    const currentCount = parseInt(countResult.rows[0].count) || 0;
    const remaining = config.limit === null ? null : Math.max(0, config.limit - currentCount);
    
    return { 
      remaining, 
      limit: config.limit,
      period: config.period
    };
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