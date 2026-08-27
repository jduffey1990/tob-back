// src/scripts/seedTemplates.ts - FIRST LINE
import dotenv from 'dotenv';
dotenv.config();

// Seeds the 106 template prayers (and the system user that owns them) into
// the prayers table. Idempotent: upserts on template_key, so row UUIDs — and
// therefore S3 audio keys — are stable across re-runs. Re-running after a
// template's text is edited updates the row in place.
//
// Run with: npm run seed:templates

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { PostgresService } from '../controllers/postgres.service';
import { SYSTEM_USER_ID, TEMPLATE_DEFAULT_VOICE_ID, TEMPLATES } from './data/templates';

async function seedTemplates() {
  const db = PostgresService.getInstance();
  await db.connect();

  console.log('🌱 Seeding prayer templates...\n');

  try {
    // Guard: duplicate slugs would silently overwrite each other in the upsert.
    const keys = new Set<string>();
    for (const t of TEMPLATES) {
      if (keys.has(t.templateKey)) {
        throw new Error(`Duplicate templateKey: ${t.templateKey}`);
      }
      keys.add(t.templateKey);
    }

    // System user that owns template rows (prayers.user_id is NOT NULL).
    // Inactive + random password: it can never log in.
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    await db.query(
      `INSERT INTO users (id, email, password_hash, name, status, subscription_tier)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO NOTHING`,
      [
        SYSTEM_USER_ID,
        'system@towerofbabble.app',
        passwordHash,
        'Tower of Babble',
        'inactive',
        'lifetime',
      ]
    );

    let inserted = 0;
    let updated = 0;

    for (const template of TEMPLATES) {
      const { rows } = await db.query<{ inserted: boolean }>(
        `INSERT INTO prayers (user_id, title, text, category, is_template, template_key, voice_id)
         VALUES ($1::uuid, $2, $3, $4, true, $5, $6)
         ON CONFLICT (template_key) WHERE is_template = true
         DO UPDATE SET
           title = EXCLUDED.title,
           text = EXCLUDED.text,
           category = EXCLUDED.category,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [
          SYSTEM_USER_ID,
          template.title,
          template.text,
          template.category,
          template.templateKey,
          TEMPLATE_DEFAULT_VOICE_ID,
        ]
      );
      if (rows[0]?.inserted) {
        inserted++;
      } else {
        updated++;
      }
    }

    console.log(JSON.stringify({
      level: 'info',
      type: 'seed_templates',
      total: TEMPLATES.length,
      inserted,
      updated,
      timestamp: new Date().toISOString(),
    }));
    console.log(`\n✅ Templates seeded: ${inserted} inserted, ${updated} updated\n`);
  } catch (error) {
    console.error('❌ Template seed failed:', error);
    throw error;
  } finally {
    await db.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  seedTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedTemplates };
