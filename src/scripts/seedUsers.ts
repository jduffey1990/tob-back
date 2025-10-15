// wsapp-users/src/scripts/seedUsers.ts
import bcrypt from 'bcrypt';
import { PostgresService } from '../controllers/postgres.service';
import type { UserSafe } from '../models/user';

type SeedUserInput = {
  email: string;
  name: string;
  password: string;            // raw password only for seeding
  status?: string;             // default 'active' for local dev
  companyId?: string | null;   // optional
};

function rowToUserSafe(row: any): UserSafe {
  return {
    id: row.id,
    companyId: row.company_id ?? null,
    email: row.email,
    name: row.name,
    status: row.status,
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function makeSeedUsers(count = 10): SeedUserInput[] {
  return Array.from({ length: count }, (_v, i) => ({
    email: `user${i + 1}@example.com`,
    name: `User ${i + 1}`,
    password: 'password123',
    status: 'active',          // for local convenience
    companyId: null,
  }));
}

async function seedUsers() {
  const db = PostgresService.getInstance();
  db.connect();

  try {
    const seeds = makeSeedUsers(10);

    // Hash once per user
    const hashed = await Promise.all(
      seeds.map(async (u) => ({
        ...u,
        passwordHash: await bcrypt.hash(u.password, 10),
      }))
    );

    // Build bulk INSERT
    const cols = ['company_id', 'email', 'password_hash', 'name', 'status'];
    const valuesSql: string[] = [];
    const params: any[] = [];

    hashed.forEach((u, idx) => {
      const base = idx * cols.length;
      params.push(u.companyId ?? null, u.email.toLowerCase(), u.passwordHash, u.name, u.status ?? 'active');
      valuesSql.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    });

    const sql = `
      INSERT INTO users (${cols.join(', ')})
      VALUES ${valuesSql.join(', ')}
      ON CONFLICT (email) DO NOTHING
      RETURNING id, company_id, email, name, status, deleted_at, created_at, updated_at
    `;

    const { rows } = await db.query(sql, params);
    const users: UserSafe[] = rows.map(rowToUserSafe);

    console.log(`✅ Seeded ${users.length} users`);
    users.forEach((u) => console.log(`${u.email} (${u.id})`));
  } catch (err) {
    console.error('❌ Error seeding users:', err);
    process.exitCode = 1;
  } finally {
    await db.disconnect();
  }
}

seedUsers();
