// src/scripts/generateTemplateAudio.ts - FIRST LINE
import dotenv from 'dotenv';
dotenv.config();

// Pre-generates TTS audio for every (template prayer × server voice) pair —
// 106 templates × 7 non-apple voices = 742 files. Idempotent: pairs with an
// existing audio_files row are skipped, and generateAndStore itself upserts
// on (prayer_id, voice_id), so the script is safe to re-run after failures.
//
// Calls AudioService.generateAndStore directly — deliberately bypassing the
// enqueueGeneration tier gate, which exists for user spend, not system jobs.
//
// Run with: npm run seed:template-audio
//
// Required .env at runtime:
//   DATABASE_URL                       (Neon)
//   AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION / S3_AUDIO_BUCKET
//   Azure + FishAudio TTS keys (same vars the dev server uses)
//   Upstash Redis vars — generateAndStore hard-requires the Redis build lock

import { PostgresService } from '../controllers/postgres.service';
import { S3Service } from '../controllers/s3.service';
import { AudioService } from '../controllers/audioService';
import { SYSTEM_USER_ID } from './data/templates';

const CONCURRENCY = 3; // respects Azure/FishAudio rate limits
const MAX_ATTEMPTS = 2;

interface WorkItem {
  prayerId: string;
  templateKey: string;
  text: string;
  voiceId: string;
  voiceName: string;
}

interface Failure {
  templateKey: string;
  voiceId: string;
  error: string;
}

async function generateTemplateAudio() {
  const db = PostgresService.getInstance();
  await db.connect();
  S3Service.initialize();

  console.log('🔊 Generating template audio...\n');

  try {
    const { rows: templates } = await db.query<{ id: string; template_key: string; text: string }>(
      `SELECT id, template_key, text
       FROM prayers
       WHERE is_template = true
       ORDER BY template_key`
    );

    const { rows: voices } = await db.query<{ id: string; name: string }>(
      `SELECT id, name
       FROM voices
       WHERE is_active = true AND provider != 'apple'
       ORDER BY sort_order`
    );

    const { rows: existing } = await db.query<{ prayer_id: string; voice_id: string }>(
      `SELECT af.prayer_id, af.voice_id
       FROM audio_files af
       JOIN prayers p ON p.id = af.prayer_id
       WHERE p.is_template = true`
    );
    const existingPairs = new Set(existing.map(r => `${r.prayer_id}:${r.voice_id}`));

    const queue: WorkItem[] = [];
    let skipped = 0;
    for (const template of templates) {
      for (const voice of voices) {
        if (existingPairs.has(`${template.id}:${voice.id}`)) {
          skipped++;
        } else {
          queue.push({
            prayerId: template.id,
            templateKey: template.template_key,
            text: template.text,
            voiceId: voice.id,
            voiceName: voice.name,
          });
        }
      }
    }

    const expected = templates.length * voices.length;
    console.log(`Templates: ${templates.length}, server voices: ${voices.length}`);
    console.log(`Pairs: ${expected} expected, ${skipped} already generated, ${queue.length} to generate\n`);

    let generated = 0;
    const failures: Failure[] = [];

    const worker = async () => {
      let item: WorkItem | undefined;
      while ((item = queue.shift()) !== undefined) {
        const { prayerId, templateKey, text, voiceId, voiceName } = item;
        let lastError: string | null = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          try {
            await AudioService.generateAndStore(prayerId, text, voiceId, SYSTEM_USER_ID);
            generated++;
            console.log(`  ✅ [${generated + failures.length + skipped}/${expected}] ${templateKey} × ${voiceName}`);
            lastError = null;
            break;
          } catch (error: any) {
            // ConflictError = Redis build lock still held (e.g. from a prior
            // crashed run) — retryable after a pause, like transient TTS errors.
            lastError = error?.message ?? String(error);
            console.error(`  ⚠️  ${templateKey} × ${voiceName} attempt ${attempt} failed: ${lastError}`);
            if (attempt < MAX_ATTEMPTS) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        }

        if (lastError !== null) {
          failures.push({ templateKey, voiceId, error: lastError });
        }
      }
    };

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

    console.log('\n' + JSON.stringify({
      level: failures.length > 0 ? 'error' : 'info',
      type: 'generate_template_audio',
      expected,
      generated,
      skipped,
      failed: failures,
      timestamp: new Date().toISOString(),
    }));

    if (failures.length > 0) {
      console.error(`\n❌ ${failures.length} pair(s) failed — re-run to retry just those\n`);
      process.exitCode = 1;
    } else {
      console.log(`\n✅ Template audio complete: ${generated} generated, ${skipped} skipped\n`);
    }
  } catch (error) {
    console.error('❌ Template audio generation failed:', error);
    throw error;
  } finally {
    await db.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  generateTemplateAudio()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { generateTemplateAudio };
