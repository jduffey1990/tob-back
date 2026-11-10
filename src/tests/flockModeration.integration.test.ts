// Integration test for flock moderation: real routes, real SQL, real Postgres.
//
// Opt-in, because the rest of the suite mocks the database and must keep
// passing without one. Point TEST_DATABASE_URL at a THROWAWAY database that
// has had every migration applied:
//
//   TEST_DATABASE_URL=postgres://user@127.0.0.1:5432/scratch npx jest flockModeration
//
// It inserts and deletes its own users (email prefix below) and nothing else.
//
// Worth the real database: almost everything here is a SQL predicate
// (membership, block, cascade), which a mocked query() cannot prove.
import Hapi from '@hapi/hapi';
import { PostgresService } from '../controllers/postgres.service';
import { EmailService } from '../controllers/email.service';
import { flockRoutes } from '../routes/flockRoutes';

const DB_URL = process.env.TEST_DATABASE_URL;
const describeIfDb = DB_URL ? describe : describe.skip;

const EMAIL_PREFIX = 'flock-moderation-it+';

describeIfDb('flock moderation (integration)', () => {
  let server: Hapi.Server;
  let db: PostgresService;
  let reportEmail: jest.SpyInstance;

  const users: Record<'leader' | 'alice' | 'bob' | 'outsider', { id: string; name: string; subscriptionTier: string }> = {} as any;
  let qr: string;
  let flockId: string;
  let prayerId: string;

  const as = (who: keyof typeof users) => ({ 'x-test-user': who });
  const call = (method: string, url: string, who: keyof typeof users, payload?: object) =>
    server.inject({ method, url, headers: as(who), payload });
  const body = (res: Hapi.ServerInjectResponse) => JSON.parse(res.payload);

  beforeAll(async () => {
    process.env.DATABASE_URL = DB_URL;
    db = PostgresService.getInstance();
    await db.connect({ max: 2 });

    await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);

    const seed = async (key: keyof typeof users, name: string, tier: string) => {
      const { rows } = await db.query(
        `INSERT INTO users (email, password_hash, name, status, subscription_tier)
         VALUES ($1, 'x', $2, 'active', $3)
         RETURNING id`,
        [`${EMAIL_PREFIX}${key}@example.com`, name, tier]
      );
      users[key] = { id: rows[0].id, name, subscriptionTier: tier };
    };
    await seed('leader', 'Leader Lee', 'prayer_warrior');
    await seed('alice', 'Alice Member', 'free');
    await seed('bob', 'Bob Member', 'free');
    await seed('outsider', 'Olive Outsider', 'free');

    // Stand-in for the JWT strategy: the header names which seeded user is calling.
    server = Hapi.server({ port: 0 });
    server.auth.scheme('test', () => ({
      authenticate: (request, h) => {
        const who = request.headers['x-test-user'] as keyof typeof users;
        return h.authenticated({ credentials: users[who] as any });
      },
    }));
    server.auth.strategy('jwt', 'test');
    server.route(flockRoutes);
    await server.initialize();

    // Never talk to SES from a test; just observe that the alert would be sent.
    reportEmail = jest
      .spyOn(EmailService.prototype, 'sendFlockPrayerReportEmail')
      .mockResolvedValue(undefined);

    const created = await call('POST', '/flocks', 'leader', { name: 'Moderation Test Flock' });
    expect(created.statusCode).toBe(201);
    flockId = body(created).id;
    qr = body(created).qrCodeIdentifier;

    for (const who of ['alice', 'bob'] as const) {
      const joined = await call('POST', '/flocks/join', who, { qrCodeIdentifier: qr });
      expect(joined.statusCode).toBe(201);
    }

    // Inserted directly: publishing through the route would enqueue TTS and push.
    const { rows } = await db.query(
      `INSERT INTO prayers (user_id, title, text, flock_id, published_at, voice_id)
       VALUES ($1::uuid, 'Sunday Prayer', 'Lord, hear us.', $2::uuid, NOW(), 'com.apple.voice.compact.en-US.Samantha')
       RETURNING id`,
      [users.leader.id, flockId]
    );
    prayerId = rows[0].id;
  });

  afterAll(async () => {
    if (db) {
      await db.query(`DELETE FROM flock_prayer_reports WHERE prayer_title = 'Sunday Prayer'`);
      await db.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);
      await db.disconnect();
    }
    if (server) await server.stop();
    jest.restoreAllMocks();
  });

  describe('flock prayer access', () => {
    it('lets the leader and members read, and hides the prayer from everyone else', async () => {
      expect((await call('GET', `/flocks/prayers/${prayerId}`, 'leader')).statusCode).toBe(200);
      expect((await call('GET', `/flocks/prayers/${prayerId}`, 'alice')).statusCode).toBe(200);
      expect((await call('GET', `/flocks/prayers/${prayerId}`, 'outsider')).statusCode).toBe(404);
    });

    it('only counts listens from the flock', async () => {
      const count = async () =>
        (await db.query(`SELECT play_count FROM prayers WHERE id = $1::uuid`, [prayerId])).rows[0].play_count;
      const before = await count();

      expect((await call('POST', `/flocks/prayers/${prayerId}/listen`, 'outsider')).statusCode).toBe(404);
      expect(await count()).toBe(before);

      expect((await call('POST', `/flocks/prayers/${prayerId}/listen`, 'alice')).statusCode).toBe(200);
      expect(await count()).toBe(before + 1);
    });
  });

  describe('roster', () => {
    it('shows the leader who follows them', async () => {
      const res = await call('GET', '/flocks/mine/members', 'leader');
      expect(res.statusCode).toBe(200);
      const roster = body(res);
      expect(roster.members.map((m: any) => m.name).sort()).toEqual(['Alice Member', 'Bob Member']);
      expect(roster.members[0]).toEqual(expect.objectContaining({
        userId: expect.any(String), joinedAt: expect.any(String), parentalConsentGiven: false,
      }));
      expect(roster.blocked).toEqual([]);
    });

    it('is a 404 for someone with no flock', async () => {
      expect((await call('GET', '/flocks/mine/members', 'outsider')).statusCode).toBe(404);
    });
  });

  describe('prayer request limits', () => {
    it('rejects oversized notes and accepts a normal share', async () => {
      const tooLong = await call('POST', '/flocks/prayer-requests', 'alice', {
        items: [{ name: 'Healing', notes: 'x'.repeat(1001) }],
      });
      expect(tooLong.statusCode).toBe(400);

      const ok = await call('POST', '/flocks/prayer-requests', 'alice', {
        items: [{ name: 'Healing', category: 'health', notes: 'For my mother' }],
      });
      expect(ok.statusCode).toBe(201);
      expect(body(await call('GET', '/flocks/prayer-requests', 'leader')).count).toBe(1);
    });
  });

  describe('remove', () => {
    it('drops the member but lets them rejoin', async () => {
      expect((await call('DELETE', `/flocks/mine/members/${users.bob.id}`, 'leader')).statusCode).toBe(200);
      expect(body(await call('GET', '/flocks/feed', 'bob')).leaders).toEqual([]);
      expect((await call('GET', `/flocks/prayers/${prayerId}`, 'bob')).statusCode).toBe(404);

      // Removing someone who is not a member is a 404, not a silent success.
      expect((await call('DELETE', `/flocks/mine/members/${users.bob.id}`, 'leader')).statusCode).toBe(404);

      expect((await call('POST', '/flocks/join', 'bob', { qrCodeIdentifier: qr })).statusCode).toBe(201);
    });

    it('cannot be used on another leader\'s flock', async () => {
      // The outsider has no flock, so there is nothing for them to remove from.
      expect((await call('DELETE', `/flocks/mine/members/${users.alice.id}`, 'outsider')).statusCode).toBe(404);
      expect(body(await call('GET', '/flocks/feed', 'alice')).leaders).toHaveLength(1);
    });
  });

  describe('block', () => {
    it('removes the member, clears their pending requests, and is idempotent', async () => {
      expect((await call('POST', '/flocks/mine/blocks', 'leader', { userId: users.alice.id })).statusCode).toBe(200);
      expect((await call('POST', '/flocks/mine/blocks', 'leader', { userId: users.alice.id })).statusCode).toBe(200);

      const roster = body(await call('GET', '/flocks/mine/members', 'leader'));
      expect(roster.members.map((m: any) => m.name)).toEqual(['Bob Member']);
      expect(roster.blocked.map((m: any) => m.name)).toEqual(['Alice Member']);

      expect(body(await call('GET', '/flocks/prayer-requests', 'leader')).count).toBe(0);
    });

    it('is quiet: the blocked user sees an ordinary "not found" everywhere', async () => {
      expect(body(await call('GET', '/flocks/feed', 'alice')).leaders).toEqual([]);
      expect((await call('GET', `/flocks/prayers/${prayerId}`, 'alice')).statusCode).toBe(404);

      const lookup = await call('POST', '/flocks/lookup', 'alice', { qrCodeIdentifier: qr });
      expect(lookup.statusCode).toBe(404);

      const join = await call('POST', '/flocks/join', 'alice', { qrCodeIdentifier: qr });
      expect(join.statusCode).toBe(404);
      // Byte-for-byte what a mistyped QR code returns.
      const bogus = await call('POST', '/flocks/join', 'alice', { qrCodeIdentifier: 'no-such-code' });
      expect(body(join)).toEqual(body(bogus));

      // Everyone else can still look the flock up.
      expect((await call('POST', '/flocks/lookup', 'outsider', { qrCodeIdentifier: qr })).statusCode).toBe(200);
    });

    it('refuses self-blocks and unknown users', async () => {
      expect((await call('POST', '/flocks/mine/blocks', 'leader', { userId: users.leader.id })).statusCode).toBe(409);
      expect((await call('POST', '/flocks/mine/blocks', 'leader', {
        userId: '00000000-0000-4000-8000-000000000000',
      })).statusCode).toBe(404);
    });

    it('can be lifted, after which the user can rejoin', async () => {
      expect((await call('DELETE', `/flocks/mine/blocks/${users.alice.id}`, 'leader')).statusCode).toBe(200);
      expect((await call('DELETE', `/flocks/mine/blocks/${users.alice.id}`, 'leader')).statusCode).toBe(404);
      expect((await call('POST', '/flocks/join', 'alice', { qrCodeIdentifier: qr })).statusCode).toBe(201);
    });
  });

  describe('report', () => {
    it('records one report per member and alerts once', async () => {
      const first = await call('POST', `/flocks/prayers/${prayerId}/report`, 'bob', { reason: 'Offensive' });
      expect(first.statusCode).toBe(201);
      const again = await call('POST', `/flocks/prayers/${prayerId}/report`, 'bob', { reason: 'Offensive' });
      expect(again.statusCode).toBe(201);

      expect(reportEmail).toHaveBeenCalledTimes(1);
      expect(reportEmail.mock.calls[0][0]).toEqual(expect.objectContaining({
        reporterName: 'Bob Member', leaderName: 'Leader Lee', prayerTitle: 'Sunday Prayer', reason: 'Offensive',
      }));

      const { rows } = await db.query(
        `SELECT reason, prayer_text FROM flock_prayer_reports WHERE prayer_id = $1::uuid`, [prayerId]
      );
      expect(rows).toEqual([{ reason: 'Offensive', prayer_text: 'Lord, hear us.' }]);
    });

    it('accepts a report with no body at all', async () => {
      expect((await call('POST', `/flocks/prayers/${prayerId}/report`, 'alice')).statusCode).toBe(201);
    });

    it('is closed to non-members and to the leader', async () => {
      expect((await call('POST', `/flocks/prayers/${prayerId}/report`, 'outsider')).statusCode).toBe(404);
      expect((await call('POST', `/flocks/prayers/${prayerId}/report`, 'leader')).statusCode).toBe(403);
    });
  });

  describe('QR reset', () => {
    it('kills the old code, keeps existing members, and the new code works', async () => {
      const res = await call('POST', '/flocks/mine/qr/reset', 'leader');
      expect(res.statusCode).toBe(200);
      const newQr = body(res).qrCodeIdentifier;
      expect(newQr).not.toBe(qr);

      expect((await call('POST', '/flocks/lookup', 'outsider', { qrCodeIdentifier: qr })).statusCode).toBe(404);
      expect((await call('POST', '/flocks/lookup', 'outsider', { qrCodeIdentifier: newQr })).statusCode).toBe(200);
      expect(body(await call('GET', '/flocks/qr', 'leader')).qrCodeIdentifier).toBe(newQr);

      expect(body(await call('GET', '/flocks/feed', 'bob')).leaders).toHaveLength(1);
    });
  });

  describe('evidence', () => {
    it('keeps the report after the leader deletes the reported prayer', async () => {
      expect((await call('DELETE', `/flocks/prayers/${prayerId}`, 'leader')).statusCode).toBe(200);
      const { rows } = await db.query(
        `SELECT prayer_id, prayer_title FROM flock_prayer_reports
         WHERE reporter_user_id = $1::uuid`, [users.bob.id]
      );
      expect(rows).toEqual([{ prayer_id: null, prayer_title: 'Sunday Prayer' }]);
    });
  });
});
