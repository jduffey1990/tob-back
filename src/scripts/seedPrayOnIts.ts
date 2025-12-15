// src/scripts/seedPrayOnItItems.ts
import { PostgresService } from '../controllers/postgres.service';

interface PrayOnItItem {
  user_id: string;
  name: string;
  category: 'family' | 'friends' | 'work' | 'health' | 'personal' | 'world' | 'other';
  relationship?: string;
  prayer_focus?: string;
  notes?: string;
}

async function seedPrayOnItItems() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  const db = PostgresService.getInstance();
  await db.connect();

  console.log('🌱 Starting Pray On It items seed...\n');

  try {
    console.log('📝 Creating Pray On It items...');

    const prayOnItItems: PrayOnItItem[] = [
      // ============================================
      // Free User (11111111) - 3 items (under limit of 5)
      // ============================================
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        name: 'Mom',
        category: 'family',
        relationship: 'Mother',
        prayer_focus: 'health',
        notes: 'Recovering from surgery, needs strength'
      },
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        name: 'John',
        category: 'friends',
        relationship: 'College roommate',
        prayer_focus: 'guidance',
        notes: 'Looking for a new job'
      },
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        name: 'Project Deadline',
        category: 'work',
        prayer_focus: 'peace',
        notes: 'Big presentation next week'
      },

      // ============================================
      // Free User Maxed (22222222) - 5 items (at limit)
      // ============================================
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        name: 'Dad',
        category: 'family',
        relationship: 'Father',
        prayer_focus: 'healing',
        notes: 'Dealing with diabetes, needs discipline'
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        name: 'Sarah',
        category: 'friends',
        relationship: 'Best friend',
        prayer_focus: 'comfort',
        notes: 'Going through a divorce'
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        name: 'Career Change',
        category: 'personal',
        prayer_focus: 'wisdom',
        notes: 'Considering leaving current job for ministry'
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        name: 'Church Youth Group',
        category: 'world',
        prayer_focus: 'protection',
        notes: 'Teens facing peer pressure and doubts'
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        name: 'Financial Stress',
        category: 'personal',
        prayer_focus: 'provision',
        notes: 'Medical bills piling up, need breakthrough'
      },

      // ============================================
      // Inactive User (33333333) - 2 items
      // ============================================
      {
        user_id: '33333333-3333-3333-3333-333333333333',
        name: 'Sister',
        category: 'family',
        relationship: 'Sibling',
        prayer_focus: 'guidance',
        notes: 'Starting college in the fall'
      },
      {
        user_id: '33333333-3333-3333-3333-333333333333',
        name: 'New Job',
        category: 'work',
        prayer_focus: 'peace',
        notes: 'First week at new company, feeling nervous'
      },

      // ============================================
      // Pro User Active (44444444) - 12 items (showing Pro value)
      // ============================================
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Grandma Rose',
        category: 'family',
        relationship: 'Grandmother',
        prayer_focus: 'healing',
        notes: 'Stage 3 cancer, chemotherapy starting soon'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Uncle Mike',
        category: 'family',
        relationship: 'Uncle',
        prayer_focus: 'salvation',
        notes: 'Never been to church, heart is hardening'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Emily',
        category: 'friends',
        relationship: 'Neighbor',
        prayer_focus: 'comfort',
        notes: 'Lost her husband last month, deep grief'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Marcus',
        category: 'friends',
        relationship: 'Accountability partner',
        prayer_focus: 'strength',
        notes: 'Battling addiction, 30 days sober'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Team Restructuring',
        category: 'work',
        prayer_focus: 'wisdom',
        notes: 'Layoffs announced, uncertain about my role'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Difficult Boss',
        category: 'work',
        relationship: 'Manager',
        prayer_focus: 'patience',
        notes: 'Micromanages everything, creates toxic environment'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Back Pain',
        category: 'health',
        prayer_focus: 'healing',
        notes: 'Chronic pain for 2 years, affecting sleep'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Anxiety',
        category: 'health',
        prayer_focus: 'peace',
        notes: 'Panic attacks increasing, seeing therapist'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Marriage Struggles',
        category: 'personal',
        prayer_focus: 'restoration',
        notes: 'Communication breakdown, considering counseling'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Son\'s Faith',
        category: 'family',
        relationship: 'Son',
        prayer_focus: 'salvation',
        notes: 'Teenager questioning everything, pulling away'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Persecuted Church',
        category: 'world',
        prayer_focus: 'protection',
        notes: 'Christians in Middle East facing violence'
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Local Homeless',
        category: 'world',
        prayer_focus: 'provision',
        notes: 'Winter coming, shelters at capacity'
      },

      // ============================================
      // Pro User Expired (55555555) - 3 items
      // ============================================
      {
        user_id: '55555555-5555-5555-5555-555555555555',
        name: 'Brother',
        category: 'family',
        relationship: 'Sibling',
        prayer_focus: 'healing',
        notes: 'Struggling with depression'
      },
      {
        user_id: '55555555-5555-5555-5555-555555555555',
        name: 'Job Search',
        category: 'work',
        prayer_focus: 'provision',
        notes: 'Unemployed for 3 months'
      },
      {
        user_id: '55555555-5555-5555-5555-555555555555',
        name: 'Rachel',
        category: 'friends',
        relationship: 'Childhood friend',
        prayer_focus: 'guidance',
        notes: 'Deciding whether to move across country'
      },

      // ============================================
      // Lifetime User (66666666) - 20 items (power user, heavily engaged)
      // ============================================
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Wife',
        category: 'family',
        relationship: 'Spouse',
        prayer_focus: 'health',
        notes: 'Autoimmune disease flare-ups, constant fatigue'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'David (Son)',
        category: 'family',
        relationship: 'Son',
        prayer_focus: 'wisdom',
        notes: 'Choosing college, needs clarity on major'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Emma (Daughter)',
        category: 'family',
        relationship: 'Daughter',
        prayer_focus: 'protection',
        notes: 'Middle school, navigating friend drama and social media'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Mom\'s Alzheimer\'s',
        category: 'family',
        relationship: 'Mother',
        prayer_focus: 'peace',
        notes: 'Progressing rapidly, doesn\'t recognize me anymore'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Dad\'s Heart',
        category: 'family',
        relationship: 'Father',
        prayer_focus: 'healing',
        notes: 'Second heart attack last month, surgery scheduled'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Pastor James',
        category: 'friends',
        relationship: 'Pastor',
        prayer_focus: 'strength',
        notes: 'Burnout from ministry, considering stepping down'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Small Group',
        category: 'friends',
        prayer_focus: 'unity',
        notes: 'Conflicts arising, need more grace for each other'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Tom (Coworker)',
        category: 'work',
        relationship: 'Colleague',
        prayer_focus: 'salvation',
        notes: 'Atheist, but asking spiritual questions lately'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Company Ethics',
        category: 'work',
        prayer_focus: 'wisdom',
        notes: 'Pressure to compromise values for profit'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Promotion Decision',
        category: 'work',
        prayer_focus: 'guidance',
        notes: 'Would mean more money but less family time'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Sleep Issues',
        category: 'health',
        prayer_focus: 'rest',
        notes: 'Insomnia for months, exhausted daily'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Weight Loss',
        category: 'health',
        prayer_focus: 'discipline',
        notes: 'Need to lose 50 lbs, doctor\'s orders'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Grief',
        category: 'personal',
        prayer_focus: 'comfort',
        notes: 'Lost my best friend to cancer, still processing'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Spiritual Dryness',
        category: 'personal',
        prayer_focus: 'renewal',
        notes: 'Feeling distant from God, prayers feel empty'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Temptation',
        category: 'personal',
        prayer_focus: 'strength',
        notes: 'Old habits trying to resurface, need accountability'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Missionaries in Africa',
        category: 'world',
        prayer_focus: 'protection',
        notes: 'The Johnson family, dangerous region, need safety'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Refugees',
        category: 'world',
        prayer_focus: 'provision',
        notes: 'Syrian families resettling in our city, need resources'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Human Trafficking',
        category: 'world',
        prayer_focus: 'justice',
        notes: 'Local organization rescuing victims, need support'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Church Building Fund',
        category: 'world',
        prayer_focus: 'provision',
        notes: 'Need $200k more, deadline approaching'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Political Division',
        category: 'world',
        prayer_focus: 'unity',
        notes: 'Nation increasingly divided, need healing and listening'
      },

      // ============================================
      // Additional items to show category diversity
      // ============================================
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        name: 'Volunteering',
        category: 'other',
        prayer_focus: 'guidance',
        notes: 'Want to serve more, not sure where to start'
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        name: 'Writing Project',
        category: 'other',
        prayer_focus: 'creativity',
        notes: 'Working on a book about faith, need inspiration'
      },
    ];

    for (const item of prayOnItItems) {
      await db.query(
        `INSERT INTO pray_on_it_items (user_id, name, category, relationship, prayer_focus, notes)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          item.user_id,
          item.name,
          item.category,
          item.relationship ?? null,
          item.prayer_focus ?? null,
          item.notes ?? null
        ]
      );
    }

    console.log(`  ✅ Created ${prayOnItItems.length} Pray On It items\n`);

    // ============================================
    // SUMMARY
    // ============================================
    console.log('📊 Seed Summary:');
    console.log('================');

    const itemStats = await db.query(`
      SELECT 
        u.name,
        u.email,
        u.subscription_tier,
        COUNT(poi.id) as item_count
      FROM users u
      LEFT JOIN pray_on_it_items poi ON u.id = poi.user_id
      WHERE u.email LIKE '%@test.com'
      GROUP BY u.id, u.name, u.email, u.subscription_tier
      ORDER BY item_count DESC
    `);

    console.log('\nPray On It items per user:');
    itemStats.rows.forEach(row => {
      const tierLimits: any = { free: 5, pro: 50, lifetime: '∞' };
      const limit = tierLimits[row.subscription_tier] || '?';
      console.log(`  ${row.name} (${row.subscription_tier}): ${row.item_count}/${limit} items`);
    });

    const categoryStats = await db.query(`
      SELECT 
        category,
        COUNT(*) as count
      FROM pray_on_it_items
      GROUP BY category
      ORDER BY count DESC
    `);

    console.log('\nItems by category:');
    categoryStats.rows.forEach(row => {
      console.log(`  ${row.category}: ${row.count} items`);
    });

    const focusStats = await db.query(`
      SELECT 
        prayer_focus,
        COUNT(*) as count
      FROM pray_on_it_items
      WHERE prayer_focus IS NOT NULL
      GROUP BY prayer_focus
      ORDER BY count DESC
      LIMIT 5
    `);

    console.log('\nTop prayer focuses:');
    focusStats.rows.forEach(row => {
      console.log(`  ${row.prayer_focus}: ${row.count} items`);
    });

    console.log('\n✅ Pray On It items seeded successfully!\n');
    console.log('📝 Test Scenarios:');
    console.log('  free@test.com         - 3/5 items (can add 2 more)');
    console.log('  free-maxed@test.com   - 5/5 items (at limit, will see 402 error on create)');
    console.log('  inactive@test.com     - 2/5 items (inactive user)');
    console.log('  pro@test.com          - 13/50 items (Pro tier benefits visible)');
    console.log('  pro-expired@test.com  - 3/5 items (expired, back to free limits)');
    console.log('  lifetime@test.com     - 22/∞ items (power user, unlimited)\n');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await db.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  seedPrayOnItItems()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedPrayOnItItems };