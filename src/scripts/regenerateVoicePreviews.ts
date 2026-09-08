// src/scripts/regenerateVoicePreviews.ts - FIRST LINE
import dotenv from 'dotenv';
dotenv.config();

// Re-synthesizes the voice-preview clip for every non-apple active voice with
// the current preview copy and overwrites it in S3 at its existing key, then
// versions voices.preview_url (?v=<runStamp>) so clients refetch past any
// cached copy of the old clip.
//
// Why this exists: the preview line changed from "...speak your AI prayers..."
// to "...speak your prayers..." (see migration 1783100000000_preview-text-drop-ai).
// Apple voices synthesize that text on-device from an iOS constant and need no
// server work; the 7 Azure/Fish clips are pre-rendered files and do.
//
// Calls TTSService.generateAudio directly — no prayer row, no audio_files row,
// no Redis build lock (that path is generateAndStore, which this deliberately
// avoids). Safe to re-run: it regenerates unconditionally and re-versions.
//
// Run with: npm run regen:voice-previews
//
// Required .env at runtime:
//   DATABASE_URL                       (Neon)
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_AUDIO_BUCKET
//   AZURE_TTS_API_KEY / AZURE_TTS_REGION, FISH_API_KEY  (same vars the dev server uses)

import { PostgresService } from '../controllers/postgres.service';
import { S3Service } from '../controllers/s3.service';
import { TTSService } from '../controllers/ttsService';
import { SYSTEM_USER_ID } from './data/templates';

// Keep in lockstep with migration 1783100000000_preview-text-drop-ai.js
const PREVIEW_TEXT = 'Let me speak your prayers into existence.';

const CONCURRENCY = 3; // respects Azure / Fish Audio rate limits
const MAX_ATTEMPTS = 2;

interface VoiceRow {
  id: string;
  name: string;
  preview_url: string | null;
}

interface Failure {
  voiceId: string;
  voiceName: string;
  error: string;
}

/** Strip origin + query from a stored preview URL to get its bare S3 key. */
function keyFromPreviewUrl(previewUrl: string): string {
  const { pathname } = new URL(previewUrl);
  return pathname.replace(/^\/+/, '');
}

/** The stored URL without any existing ?v= param, so re-runs don't stack them. */
function baseUrl(previewUrl: string): string {
  const u = new URL(previewUrl);
  return `${u.origin}${u.pathname}`;
}

async function regenerateVoicePreviews() {
  const db = PostgresService.getInstance();
  await db.connect();
  S3Service.initialize();

  console.log('🔊 Regenerating voice previews...\n');
  console.log(`   Copy: "${PREVIEW_TEXT}"\n`);

  const runStamp = Date.now();

  try {
    const { rows: voices } = await db.query<VoiceRow>(
      `SELECT id, name, preview_url
         FROM voices
        WHERE is_active = true
          AND provider != 'apple'
        ORDER BY sort_order`
    );

    const missingUrl = voices.filter(v => !v.preview_url);
    if (missingUrl.length > 0) {
      console.warn(`⚠️  Skipping ${missingUrl.length} active non-apple voice(s) with no preview_url: ${missingUrl.map(v => v.name).join(', ')}\n`);
    }

    const queue = voices.filter(v => v.preview_url) as (VoiceRow & { preview_url: string })[];
    const total = queue.length;
    console.log(`Voices to regenerate: ${total}\n`);

    let done = 0;
    const failures: Failure[] = [];

    const worker = async () => {
      let voice: (VoiceRow & { preview_url: string }) | undefined;
      while ((voice = queue.shift()) !== undefined) {
        const { id, name, preview_url } = voice;
        const key = keyFromPreviewUrl(preview_url);
        let lastError: string | null = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            const tts = await TTSService.generateAudio({
              prayerId: 'voice-preview',
              text: PREVIEW_TEXT,
              voiceId: id,
              userId: SYSTEM_USER_ID,
            });

            const audioBuffer = Buffer.from(tts.audioData, 'base64');
            await S3Service.uploadToKey(key, audioBuffer, 'audio/mpeg');

            const versionedUrl = `${baseUrl(preview_url)}?v=${runStamp}`;
            await db.query(
              `UPDATE voices
                  SET preview_url = $1,
                      preview_text = $2,
                      updated_at = NOW()
                WHERE id = $3`,
              [versionedUrl, PREVIEW_TEXT, id]
            );

            done++;
            console.log(`  ✅ [${done + failures.length}/${total}] ${name} → ${key} (${audioBuffer.length} bytes)`);
            lastError = null;
            break;
          } catch (error: any) {
            lastError = error?.message ?? String(error);
            console.error(`  ⚠️  ${name} attempt ${attempt} failed: ${lastError}`);
            if (attempt < MAX_ATTEMPTS) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (lastError !== null) {
          failures.push({ voiceId: id, voiceName: name, error: lastError });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    console.log('\n' + JSON.stringify({
      level: failures.length > 0 ? 'error' : 'info',
      type: 'regenerate_voice_previews',
      runStamp,
      total,
      regenerated: done,
      failed: failures,
      timestamp: new Date().toISOString(),
    }));

    if (failures.length > 0) {
      console.error(`\n❌ ${failures.length} voice(s) failed — re-run to retry\n`);
      process.exitCode = 1;
    } else {
      console.log(`\n✅ Voice previews regenerated: ${done}. New URL stamp: ?v=${runStamp}\n`);
    }
  } catch (error) {
    console.error('❌ Voice preview regeneration failed:', error);
    throw error;
  } finally {
    await db.disconnect();
  }
}

if (require.main === module) {
  regenerateVoicePreviews()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { regenerateVoicePreviews };
