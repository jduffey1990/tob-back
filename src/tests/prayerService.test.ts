// src/tests/prayerService.test.ts
import { PrayerService } from '../controllers/prayerService';
import { PostgresService } from '../controllers/postgres.service';
import { Prayer, CreatePrayerInput, UpdatePrayerInput } from '../models/prayer';

// Mock the PostgresService
jest.mock('../controllers/postgres.service');

describe('PrayerService', () => {
  let mockDb: any;

  beforeEach(() => {
    // Reset mocks before each test
    jest.clearAllMocks();

    // Create mock database instance
    mockDb = {
      query: jest.fn(),
      runInTransaction: jest.fn(),
    };

    // Mock getInstance to return our mock db
    (PostgresService.getInstance as jest.Mock).mockReturnValue(mockDb);
  });

  describe('findUserPrayers', () => {
    it('should return all non-deleted prayers for a user ordered by created_at DESC', async () => {
      const mockRows = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          user_id: 'user-123',
          title: 'Morning Prayer',
          text: 'Thank you Lord for this day',
          category: 'morning',
          is_template: false,
          play_count: 5,
          last_played_at: new Date('2024-01-15'),
          created_at: new Date('2024-01-02'),
          updated_at: new Date('2024-01-15')
        },
        {
          id: '123e4567-e89b-12d3-a456-426614174001',
          user_id: 'user-123',
          title: 'Evening Prayer',
          text: 'Bless my family tonight',
          category: 'evening',
          is_template: false,
          play_count: 3,
          last_played_at: new Date('2024-01-14'),
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-14')
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRows });

      const result = await PrayerService.findUserPrayers('user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1::uuid'),
        ['user-123']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC'),
        expect.anything()
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user-123',
        title: 'Morning Prayer',
        text: 'Thank you Lord for this day',
        category: 'morning',
        isTemplate: false,
        playCount: 5,
        lastPlayedAt: new Date('2024-01-15'),
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-15'),
        deletedAt: null,
      });
    });

    it('should return empty array when user has no prayers', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await PrayerService.findUserPrayers('user-123');

      expect(result).toEqual([]);
    });

    it('should exclude deleted prayers', async () => {
      const mockRows = [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          user_id: 'user-123',
          title: 'Active Prayer',
          text: 'This prayer is active',
          category: null,
          is_template: false,
          play_count: 0,
          last_played_at: null,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01')
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRows });

      const result = await PrayerService.findUserPrayers('user-123');

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Active Prayer');
    });
  });

  describe('findPrayerById', () => {
    it('should return a prayer when found and belongs to user', async () => {
      const mockRow = {
        id: 'prayer-123',
        user_id: 'user-123',
        title: 'My Prayer',
        text: 'Prayer text here',
        category: 'gratitude',
        is_template: false,
        play_count: 10,
        last_played_at: new Date('2024-01-15'),
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-15')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await PrayerService.findPrayerById('prayer-123', 'user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1::uuid'),
        ['prayer-123', 'user-123']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND user_id = $2::uuid'),
        expect.anything()
      );
      expect(result).toEqual({
        id: 'prayer-123',
        userId: 'user-123',
        title: 'My Prayer',
        text: 'Prayer text here',
        category: 'gratitude',
        isTemplate: false,
        playCount: 10,
        lastPlayedAt: new Date('2024-01-15'),
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-15'),
        deletedAt: null,
      });
    });

    it('should return null when prayer not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await PrayerService.findPrayerById('nonexistent-prayer', 'user-123');

      expect(result).toBeNull();
    });

    it('should return null when prayer belongs to different user', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await PrayerService.findPrayerById('prayer-123', 'wrong-user');

      expect(result).toBeNull();
    });

    it('should return null when prayer is deleted', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await PrayerService.findPrayerById('deleted-prayer', 'user-123');

      expect(result).toBeNull();
    });
  });

  describe('createPrayer', () => {
    it('should create a prayer with all fields', async () => {
      const mockRow = {
        id: 'new-prayer-123',
        user_id: 'user-123',
        title: 'New Prayer',
        text: 'This is my new prayer',
        category: 'morning',
        is_template: false,
        play_count: 0,
        last_played_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const input: CreatePrayerInput = {
        userId: 'user-123',
        title: 'New Prayer',
        text: 'This is my new prayer',
        category: 'morning',
        isTemplate: false,
      };

      const result = await PrayerService.createPrayer(input);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO prayers'),
        ['user-123', 'New Prayer', 'This is my new prayer', 'morning', false]
      );
      expect(result.title).toBe('New Prayer');
      expect(result.text).toBe('This is my new prayer');
      expect(result.category).toBe('morning');
      expect(result.isTemplate).toBe(false);
      expect(result.playCount).toBe(0);
    });

    it('should create a prayer without category (null)', async () => {
      const mockRow = {
        id: 'new-prayer-123',
        user_id: 'user-123',
        title: 'Uncategorized Prayer',
        text: 'Prayer without category',
        category: null,
        is_template: false,
        play_count: 0,
        last_played_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const input: CreatePrayerInput = {
        userId: 'user-123',
        title: 'Uncategorized Prayer',
        text: 'Prayer without category',
      };

      const result = await PrayerService.createPrayer(input);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.anything(),
        ['user-123', 'Uncategorized Prayer', 'Prayer without category', null, false]
      );
      expect(result.category).toBeNull();
    });

    it('should create a template prayer', async () => {
      const mockRow = {
        id: 'template-prayer-123',
        user_id: 'admin-123',
        title: "Lord's Prayer",
        text: 'Our Father who art in heaven...',
        category: 'traditional',
        is_template: true,
        play_count: 0,
        last_played_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const input: CreatePrayerInput = {
        userId: 'admin-123',
        title: "Lord's Prayer",
        text: 'Our Father who art in heaven...',
        category: 'traditional',
        isTemplate: true,
      };

      const result = await PrayerService.createPrayer(input);

      expect(result.isTemplate).toBe(true);
    });

    it('should default isTemplate to false when not provided', async () => {
      const mockRow = {
        id: 'new-prayer-123',
        user_id: 'user-123',
        title: 'Regular Prayer',
        text: 'Not a template',
        category: null,
        is_template: false,
        play_count: 0,
        last_played_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const input: CreatePrayerInput = {
        userId: 'user-123',
        title: 'Regular Prayer',
        text: 'Not a template',
      };

      const result = await PrayerService.createPrayer(input);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.anything(),
        expect.arrayContaining([false])
      );
      expect(result.isTemplate).toBe(false);
    });
  });

  describe('updatePrayer', () => {
    it('should update prayer title and text', async () => {
      const mockRow = {
        id: 'prayer-123',
        user_id: 'user-123',
        title: 'Updated Title',
        text: 'Updated text',
        category: 'morning',
        is_template: false,
        play_count: 5,
        last_played_at: new Date('2024-01-10'),
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-15')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const updates: UpdatePrayerInput = {
        title: 'Updated Title',
        text: 'Updated text',
      };

      const result = await PrayerService.updatePrayer('prayer-123', 'user-123', updates);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE prayers'),
        expect.arrayContaining(['Updated Title', 'Updated text', 'prayer-123', 'user-123'])
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.anything()
      );
      expect(result.title).toBe('Updated Title');
      expect(result.text).toBe('Updated text');
    });

    it('should update only category', async () => {
      const mockRow = {
        id: 'prayer-123',
        user_id: 'user-123',
        title: 'My Prayer',
        text: 'Prayer text',
        category: 'evening',
        is_template: false,
        play_count: 5,
        last_played_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-15')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const updates: UpdatePrayerInput = {
        category: 'evening',
      };

      const result = await PrayerService.updatePrayer('prayer-123', 'user-123', updates);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET category = $1'),
        expect.arrayContaining(['evening', 'prayer-123', 'user-123'])
      );
      expect(result.category).toBe('evening');
    });

    it('should throw error when no fields to update', async () => {
      const updates: UpdatePrayerInput = {};

      await expect(
        PrayerService.updatePrayer('prayer-123', 'user-123', updates)
      ).rejects.toThrow('No fields to update');

      expect(mockDb.query).not.toHaveBeenCalled();
    });

    it('should throw error when prayer not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const updates: UpdatePrayerInput = {
        title: 'Updated Title',
      };

      await expect(
        PrayerService.updatePrayer('nonexistent-prayer', 'user-123', updates)
      ).rejects.toThrow('Prayer not found or unauthorized');
    });

    it('should throw error when prayer belongs to different user', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const updates: UpdatePrayerInput = {
        title: 'Updated Title',
      };

      await expect(
        PrayerService.updatePrayer('prayer-123', 'wrong-user', updates)
      ).rejects.toThrow('Prayer not found or unauthorized');
    });

    it('should update multiple fields at once', async () => {
      const mockRow = {
        id: 'prayer-123',
        user_id: 'user-123',
        title: 'Updated Prayer',
        text: 'Updated prayer text',
        category: 'evening',
        is_template: false,
        play_count: 5,
        last_played_at: null,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-15')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const updates: UpdatePrayerInput = {
        title: 'Updated Prayer',
        text: 'Updated prayer text',
        category: 'evening',
      };

      const result = await PrayerService.updatePrayer('prayer-123', 'user-123', updates);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE prayers'),
        expect.arrayContaining(['Updated Prayer', 'Updated prayer text', 'evening', 'prayer-123', 'user-123'])
      );
      expect(result.title).toBe('Updated Prayer');
      expect(result.text).toBe('Updated prayer text');
      expect(result.category).toBe('evening');
    });

    it('should not allow updating template prayers', async () => {
      // Template prayers should not be editable by users
      // The WHERE clause with user_id check will prevent this
      mockDb.query.mockResolvedValue({ rows: [] });

      const updates: UpdatePrayerInput = {
        title: 'Trying to update template',
      };

      await expect(
        PrayerService.updatePrayer('template-prayer-123', 'user-123', updates)
      ).rejects.toThrow('Prayer not found or unauthorized');
    });
  });

  describe('deletePrayer', () => {
    it('should hard delete a prayer', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 1 });

      await PrayerService.deletePrayer('prayer-123', 'user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM prayers'),
        ['prayer-123', 'user-123']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1::uuid'),
        expect.anything()
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND user_id = $2::uuid'),
        expect.anything()
      );
    });

    it('should throw error when prayer not found', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 0 });

      await expect(
        PrayerService.deletePrayer('nonexistent-prayer', 'user-123')
      ).rejects.toThrow('Prayer not found');
    });

    it('should throw error when prayer belongs to different user', async () => {
      mockDb.query.mockResolvedValue({ rowCount: 0 });

      await expect(
        PrayerService.deletePrayer('prayer-123', 'wrong-user')
      ).rejects.toThrow('Prayer not found');
    });
  });

  describe('recordPlayback', () => {
    it('should increment play count and update last played timestamp', async () => {
      const mockRow = {
        id: 'prayer-123',
        user_id: 'user-123',
        title: 'My Prayer',
        text: 'Prayer text',
        category: 'morning',
        is_template: false,
        play_count: 6,
        last_played_at: new Date('2024-01-15T10:30:00Z'),
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-15T10:30:00Z')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await PrayerService.recordPlayback('prayer-123', 'user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET play_count = play_count + 1'),
        ['prayer-123', 'user-123']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('last_played_at = NOW()'),
        expect.anything()
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('updated_at = NOW()'),
        expect.anything()
      );
      expect(result.playCount).toBe(6);
      expect(result.lastPlayedAt).toEqual(new Date('2024-01-15T10:30:00Z'));
    });

    it('should throw error when prayer not found', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        PrayerService.recordPlayback('nonexistent-prayer', 'user-123')
      ).rejects.toThrow('Prayer not found');
    });

    it('should throw error when prayer belongs to different user', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      await expect(
        PrayerService.recordPlayback('prayer-123', 'wrong-user')
      ).rejects.toThrow('Prayer not found');
    });

    it('should update last played timestamp for first playback', async () => {
      const mockRow = {
        id: 'prayer-123',
        user_id: 'user-123',
        title: 'My Prayer',
        text: 'Prayer text',
        category: 'morning',
        is_template: false,
        play_count: 1,
        last_played_at: new Date('2024-01-15T10:30:00Z'),
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-15T10:30:00Z')
      };

      mockDb.query.mockResolvedValue({ rows: [mockRow] });

      const result = await PrayerService.recordPlayback('prayer-123', 'user-123');

      expect(result.playCount).toBe(1);
      expect(result.lastPlayedAt).not.toBeNull();
    });
  });

  describe('getPrayerTemplates', () => {
    it('should return all template prayers ordered by category and title', async () => {
      const mockRows = [
        {
          id: 'template-1',
          user_id: 'admin-123',
          title: "Hail Mary",
          text: 'Hail Mary, full of grace...',
          category: 'traditional',
          is_template: true,
          play_count: 100,
          last_played_at: null,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01')
        },
        {
          id: 'template-2',
          user_id: 'admin-123',
          title: "Lord's Prayer",
          text: 'Our Father who art in heaven...',
          category: 'traditional',
          is_template: true,
          play_count: 150,
          last_played_at: null,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01')
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRows });

      const result = await PrayerService.getPrayerTemplates();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE is_template = true'),
        undefined
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY category, title'),
        undefined
      );
      expect(result).toHaveLength(2);
      expect(result[0].isTemplate).toBe(true);
      expect(result[1].isTemplate).toBe(true);
    });

    it('should return empty array when no templates exist', async () => {
      mockDb.query.mockResolvedValue({ rows: [] });

      const result = await PrayerService.getPrayerTemplates();

      expect(result).toEqual([]);
    });

    it('should exclude deleted templates', async () => {
      const mockRows = [
        {
          id: 'template-1',
          user_id: 'admin-123',
          title: "Active Template",
          text: 'Template text',
          category: 'traditional',
          is_template: true,
          play_count: 50,
          last_played_at: null,
          created_at: new Date('2024-01-01'),
          updated_at: new Date('2024-01-01')
        },
      ];

      mockDb.query.mockResolvedValue({ rows: mockRows });

      const result = await PrayerService.getPrayerTemplates();

      expect(result).toHaveLength(1);
    });
  });

  describe('countUserPrayers', () => {
    it('should return count of active prayers for user', async () => {
      mockDb.query.mockResolvedValue({ 
        rows: [{ count: '5' }] 
      });

      const result = await PrayerService.countUserPrayers('user-123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*) as count'),
        ['user-123']
      );
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE user_id = $1::uuid'),
        expect.anything()
      );
      expect(result).toBe(5);
    });

    it('should return 0 when user has no prayers', async () => {
      mockDb.query.mockResolvedValue({ 
        rows: [{ count: '0' }] 
      });

      const result = await PrayerService.countUserPrayers('user-123');

      expect(result).toBe(0);
    });

    it('should exclude deleted prayers from count', async () => {
      mockDb.query.mockResolvedValue({ 
        rows: [{ count: '3' }] 
      });

      const result = await PrayerService.countUserPrayers('user-123');

      expect(result).toBe(3);
    });

    it('should handle large prayer counts', async () => {
      mockDb.query.mockResolvedValue({ 
        rows: [{ count: '999' }] 
      });

      const result = await PrayerService.countUserPrayers('user-123');

      expect(result).toBe(999);
    });
  });
});