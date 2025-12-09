// src/scripts/seedUsersAndPrayers.ts
import bcrypt from 'bcrypt';
import { PostgresService } from '../controllers/postgres.service';

interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  status: 'active' | 'inactive';
  subscription_tier: 'free' | 'pro' | 'lifetime';
  subscription_expires_at: Date | null;
}

interface Prayer {
  user_id: string;
  title: string;
  text: string;
  category: string;
  is_template: boolean;
  play_count: number;
  last_played_at: Date | null;
}

async function seedDatabase() {
  console.log('DATABASE_URL:', process.env.DATABASE_URL)
  const db = PostgresService.getInstance();
  await db.connect();

  console.log('🌱 Starting database seed...\n');

  try {
    // ============================================
    // 1. CREATE TEST USERS
    // ============================================
    console.log('📝 Creating test users...');

    const testUsers: User[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        email: 'free@test.com',
        name: 'Free User',
        password: 'password123',
        status: 'active',
        subscription_tier: 'free',
        subscription_expires_at: null
      },
      {
        id: '22222222-2222-2222-2222-222222222222',
        email: 'free-maxed@test.com',
        name: 'Free User (Max Prayers)',
        password: 'password123',
        status: 'active',
        subscription_tier: 'free',
        subscription_expires_at: null
      },
      {
        id: '33333333-3333-3333-3333-333333333333',
        email: 'inactive@test.com',
        name: 'Inactive User',
        password: 'password123',
        status: 'inactive',
        subscription_tier: 'free',
        subscription_expires_at: null
      },
      {
        id: '44444444-4444-4444-4444-444444444444',
        email: 'pro@test.com',
        name: 'Pro User (Active)',
        password: 'password123',
        status: 'active',
        subscription_tier: 'pro',
        subscription_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
      },
      {
        id: '55555555-5555-5555-5555-555555555555',
        email: 'pro-expired@test.com',
        name: 'Pro User (Expired)',
        password: 'password123',
        status: 'active',
        subscription_tier: 'pro',
        subscription_expires_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 days ago
      },
      {
        id: '66666666-6666-6666-6666-666666666666',
        email: 'lifetime@test.com',
        name: 'Lifetime User',
        password: 'password123',
        status: 'active',
        subscription_tier: 'lifetime',
        subscription_expires_at: null
      }
    ];

    for (const user of testUsers) {
      const passwordHash = await bcrypt.hash(user.password, 10);
      
      await db.query(
        `INSERT INTO users (id, email, password_hash, name, status, subscription_tier, subscription_expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (email) DO NOTHING`,
        [
          user.id,
          user.email,
          passwordHash,
          user.name,
          user.status,
          user.subscription_tier,
          user.subscription_expires_at
        ]
      );
      
      console.log(`  ✅ ${user.name} (${user.email}) - ${user.subscription_tier}`);
    }

    console.log('\n📿 Creating prayers...');

    // ============================================
    // 2. CREATE PRAYERS FOR EACH USER TYPE
    // ============================================

    const prayers: Prayer[] = [
      // Free User - 2 prayers (under limit)
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        title: 'Morning Gratitude',
        text: 'Dear Lord, thank you for this new day. Guide my steps and help me be a blessing to others. Amen.',
        category: 'morning',
        is_template: false,
        play_count: 5,
        last_played_at: new Date(Date.now() - 2 * 60 * 60 * 1000) // 2 hours ago
      },
      {
        user_id: '11111111-1111-1111-1111-111111111111',
        title: 'Evening Prayer',
        text: 'Heavenly Father, as this day ends, I thank you for your protection and provision. Grant me peaceful rest. Amen.',
        category: 'evening',
        is_template: false,
        play_count: 3,
        last_played_at: new Date(Date.now() - 12 * 60 * 60 * 1000) // 12 hours ago
      },

      // Free User (Maxed) - 5 prayers (at limit)
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        title: 'Prayer for Family',
        text: 'Lord, I lift up my family to you. Protect them, guide them, and draw them closer to you each day.',
        category: 'intercession',
        is_template: false,
        play_count: 10,
        last_played_at: new Date()
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        title: 'Prayer for Work',
        text: 'God, grant me wisdom and patience at work. Help me honor you in all I do.',
        category: 'daily',
        is_template: false,
        play_count: 8,
        last_played_at: new Date()
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        title: 'Prayer for Peace',
        text: 'Prince of Peace, calm my anxious heart. Help me trust in your perfect plan.',
        category: 'comfort',
        is_template: false,
        play_count: 15,
        last_played_at: new Date()
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        title: 'Prayer for Strength',
        text: 'Lord, when I am weak, you are strong. Give me the strength to face today\'s challenges.',
        category: 'encouragement',
        is_template: false,
        play_count: 12,
        last_played_at: new Date()
      },
      {
        user_id: '22222222-2222-2222-2222-222222222222',
        title: 'Bedtime Prayer',
        text: 'Father, I lay down to rest trusting in your care. Watch over me through the night.',
        category: 'evening',
        is_template: false,
        play_count: 20,
        last_played_at: new Date()
      },

      // Inactive User - 1 prayer (can't use until activated)
      {
        user_id: '33333333-3333-3333-3333-333333333333',
        title: 'My First Prayer',
        text: 'God, I\'m new to this app. Help me grow closer to you through prayer.',
        category: 'personal',
        is_template: false,
        play_count: 0,
        last_played_at: null
      },

      // Pro User (Active) - 10 prayers (over free limit)
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Morning Devotion',
        text: 'Lord, this day is yours. Use me as your instrument to bring light to the world.',
        category: 'morning',
        is_template: false,
        play_count: 25,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Prayer for Wisdom',
        text: 'God of all wisdom, grant me discernment in the decisions I face today.',
        category: 'guidance',
        is_template: false,
        play_count: 18,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Intercession for Friends',
        text: 'Heavenly Father, I bring my friends before you. Meet their needs and bless them abundantly.',
        category: 'intercession',
        is_template: false,
        play_count: 22,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Prayer for Healing',
        text: 'Great Physician, I pray for those who are sick. Bring healing and comfort to their bodies and minds.',
        category: 'healing',
        is_template: false,
        play_count: 30,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Gratitude List',
        text: 'Thank you, Lord, for: my health, my family, my home, your faithfulness, and your endless love.',
        category: 'gratitude',
        is_template: false,
        play_count: 40,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Prayer for the Church',
        text: 'Father, strengthen your Church. Unite us in love and send us out to serve the world.',
        category: 'intercession',
        is_template: false,
        play_count: 15,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Prayer for Nations',
        text: 'Lord of all nations, bring peace where there is war, justice where there is oppression.',
        category: 'intercession',
        is_template: false,
        play_count: 10,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Personal Confession',
        text: 'God, I confess my shortcomings. Cleanse me, renew me, and help me walk in your ways.',
        category: 'confession',
        is_template: false,
        play_count: 8,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Midday Reset',
        text: 'Lord, as I pause in this busy day, recenter my heart on you. Refresh my spirit.',
        category: 'daily',
        is_template: false,
        play_count: 35,
        last_played_at: new Date()
      },
      {
        user_id: '44444444-4444-4444-4444-444444444444',
        title: 'Night Watch Prayer',
        text: 'Father, as I prepare for sleep, I entrust my loved ones to your care. Keep us safe.',
        category: 'evening',
        is_template: false,
        play_count: 28,
        last_played_at: new Date()
      },

      // Pro User (Expired) - 3 prayers (should see upgrade prompt)
      {
        user_id: '55555555-5555-5555-5555-555555555555',
        title: 'Daily Bread Prayer',
        text: 'Lord, give us this day our daily bread, and help us trust in your provision.',
        category: 'daily',
        is_template: false,
        play_count: 5,
        last_played_at: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) // 40 days ago
      },
      {
        user_id: '55555555-5555-5555-5555-555555555555',
        title: 'Prayer for Renewal',
        text: 'God, renew my subscription to your grace. Help me walk with you daily.',
        category: 'personal',
        is_template: false,
        play_count: 3,
        last_played_at: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
      },
      {
        user_id: '55555555-5555-5555-5555-555555555555',
        title: 'Simple Thanks',
        text: 'Thank you, God, for everything. Amen.',
        category: 'gratitude',
        is_template: false,
        play_count: 10,
        last_played_at: new Date(Date.now() - 32 * 24 * 60 * 60 * 1000)
      },

      // Lifetime User - 15 prayers (unlimited, highly engaged)
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'The Lord\'s Prayer',
        text: 'Our Father in heaven, hallowed be your name. Your kingdom come, your will be done, on earth as it is in heaven. Give us today our daily bread. And forgive us our debts, as we also have forgiven our debtors. And lead us not into temptation, but deliver us from the evil one.',
        category: 'traditional',
        is_template: false,
        play_count: 100,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Serenity Prayer',
        text: 'God, grant me the serenity to accept the things I cannot change, courage to change the things I can, and wisdom to know the difference.',
        category: 'traditional',
        is_template: false,
        play_count: 75,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'St. Francis Prayer',
        text: 'Lord, make me an instrument of your peace. Where there is hatred, let me sow love; where there is injury, pardon; where there is doubt, faith.',
        category: 'traditional',
        is_template: false,
        play_count: 60,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Morning Consecration',
        text: 'Lord, I offer you this day. Every thought, word, and action is yours. Use me for your glory.',
        category: 'morning',
        is_template: false,
        play_count: 90,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer for My Children',
        text: 'Father, protect my children. Guide them in truth, surround them with godly influences, and help them know your love.',
        category: 'family',
        is_template: false,
        play_count: 85,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer for My Spouse',
        text: 'Lord, bless my marriage. Help us grow in love, patience, and understanding. May we reflect your love to the world.',
        category: 'family',
        is_template: false,
        play_count: 80,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer Before Meals',
        text: 'Bless this food, Lord. Thank you for providing for our needs. May this meal strengthen us to serve you.',
        category: 'daily',
        is_template: false,
        play_count: 200,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer for Difficult People',
        text: 'God, help me love those who are hard to love. Give me patience and help me see them through your eyes.',
        category: 'growth',
        is_template: false,
        play_count: 45,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer for Financial Provision',
        text: 'Provider God, I trust you for my financial needs. Help me be wise with resources and generous with blessings.',
        category: 'provision',
        is_template: false,
        play_count: 55,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer for Guidance',
        text: 'Holy Spirit, guide me today. When I face decisions, show me the way. I trust your leading.',
        category: 'guidance',
        is_template: false,
        play_count: 70,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer for the Lost',
        text: 'Father, I pray for those who don\'t know you. Open their hearts, send laborers into the harvest.',
        category: 'intercession',
        is_template: false,
        play_count: 40,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer in Suffering',
        text: 'Lord, in this pain, I cling to you. You are close to the brokenhearted. Be my comfort and strength.',
        category: 'comfort',
        is_template: false,
        play_count: 25,
        last_played_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer of Surrender',
        text: 'Not my will, but yours be done. I surrender all to you, Lord. Have your way in my life.',
        category: 'surrender',
        is_template: false,
        play_count: 50,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Prayer for Joy',
        text: 'God, fill me with your joy. Not happiness based on circumstances, but deep joy rooted in your presence.',
        category: 'encouragement',
        is_template: false,
        play_count: 65,
        last_played_at: new Date()
      },
      {
        user_id: '66666666-6666-6666-6666-666666666666',
        title: 'Nighttime Reflection',
        text: 'Lord, as this day ends, I reflect on your faithfulness. Thank you for being with me every moment.',
        category: 'evening',
        is_template: false,
        play_count: 95,
        last_played_at: new Date()
      }
    ];

    for (const prayer of prayers) {
      await db.query(
        `INSERT INTO prayers (user_id, title, text, category, is_template, play_count, last_played_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          prayer.user_id,
          prayer.title,
          prayer.text,
          prayer.category,
          prayer.is_template,
          prayer.play_count,
          prayer.last_played_at
        ]
      );
    }

    console.log(`  ✅ Created ${prayers.length} prayers\n`);

    // ============================================
    // 3. SUMMARY
    // ============================================
    console.log('📊 Seed Summary:');
    console.log('================');
    
    const userStats = await db.query(`
      SELECT 
        subscription_tier,
        COUNT(*) as count
      FROM users
      GROUP BY subscription_tier
      ORDER BY subscription_tier
    `);
    
    console.log('\nUsers by tier:');
    userStats.rows.forEach(row => {
      console.log(`  ${row.subscription_tier}: ${row.count} users`);
    });

    const prayerStats = await db.query(`
      SELECT 
        u.name,
        u.subscription_tier,
        COUNT(p.id) as prayer_count
      FROM users u
      LEFT JOIN prayers p ON u.id = p.user_id
      GROUP BY u.id, u.name, u.subscription_tier
      ORDER BY prayer_count DESC
    `);

    console.log('\nPrayers per user:');
    prayerStats.rows.forEach(row => {
      console.log(`  ${row.name} (${row.subscription_tier}): ${row.prayer_count} prayers`);
    });

    console.log('\n✅ Database seeded successfully!\n');
    console.log('🔑 Test Credentials:');
    console.log('  All passwords: password123\n');
    console.log('📧 Test Accounts:');
    console.log('  free@test.com         - Free tier, 2 prayers (can add 3 more)');
    console.log('  free-maxed@test.com   - Free tier, 5 prayers (at limit, should see upgrade prompt)');
    console.log('  inactive@test.com     - Inactive account (needs email verification)');
    console.log('  pro@test.com          - Active Pro, 10 prayers (expires in 1 year)');
    console.log('  pro-expired@test.com  - Expired Pro, 3 prayers (should see renewal prompt)');
    console.log('  lifetime@test.com     - Lifetime tier, 15 prayers (unlimited)\n');

  } catch (error) {
    console.error('❌ Seed failed:', error);
    throw error;
  } finally {
    await db.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

export { seedDatabase };