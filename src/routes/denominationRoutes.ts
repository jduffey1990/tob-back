// src/routes/denominationRoutes.ts
import { Request, ResponseToolkit, ServerRoute } from '@hapi/hapi';

/**
 * Master list of religious denominations
 * This list is returned to the iOS app for the signup/settings denomination picker
 */
const DENOMINATIONS = [
  // Christianity
  'Christian',
  'Roman Catholic',
  'Eastern Orthodox',
  'Anglican/Episcopal',
  'Baptist',
  'Lutheran',
  'Methodist',
  'Presbyterian',
  'Pentecostal',
  'Protestant',
  'Latter-day Saints (Mormon)',
  'Seventh-day Adventist',
  
  // Judaism
  'Orthodox Judaism',
  'Conservative Judaism',
  'Reform Judaism',
  'Reconstructionist Judaism',
  
  // Islam
  'Sunni Islam',
  'Shia Islam',
  'Sufi',
  
  // Eastern Religions
  'Buddhism - Theravada',
  'Buddhism - Mahayana',
  'Buddhism - Vajrayana (Tibetan)',
  'Hinduism',
  'Sikhism',
  'Taoism',
  
  // Other
  "Bahá'í Faith",
  'Unitarian Universalist',
  'Spiritual but not religious',
  'Atheist',
  'None',
  'Other'
];

/**
 * Denomination routes
 * Public endpoint - no authentication required
 */
export const denominationRoutes: ServerRoute[] = [
  {
    method: 'GET',
    path: '/denominations',
    handler: async (request: Request, h: ResponseToolkit) => {
      return h.response({
        denominations: DENOMINATIONS,
        count: DENOMINATIONS.length
      }).code(200);
    },
    options: {
      auth: false, // Public endpoint - accessible without login
      description: 'Get list of religious denominations for signup/settings picker',
      tags: ['api', 'denominations']
    }
  }
];