# Voice System Refactor: Index → ID Architecture

## The Problem

Voice selection is hardcoded and index-based across both the backend and iOS app. This makes it impossible to add, remove, or reorder voices without breaking every user's saved preference. It also blocks the future voice cloning feature (OpenVoice V2), which requires dynamically adding per-user voices.

---

## Current State (Before)

### Data Flow: User Selects a Voice

```
iOS VoiceSelectionView
  → user taps row at position 3
  → calls UserSettings.updateVoiceIndex(3)
  → sends PATCH /users/me/settings { voiceIndex: 3 }
  → backend stores in users.settings JSONB: {"voiceIndex": 3, "playbackRate": 0.5}
  → next TTS request: backend does voices[3] to get "en-US-JennyNeural"
```

### Where Voices Live (Hardcoded)

| Location | What it does |
|----------|-------------|
| `ttsService.ts → getAvailableVoices()` | Returns hardcoded array of 9 voices |
| `ttsService.ts → getVoiceById(id)` | Searches hardcoded array by `id` field |
| `ttsService.ts → getVoicesForTier(tier)` | Filters hardcoded array by tier |
| `ttsService.ts → canUserUseVoice()` | Checks tier hierarchy (hardcoded map) |
| `ttsRoutes.ts → GET /voices` | Calls hardcoded methods, returns full list |
| `ttsRoutes.ts → GET /voices/preview/{id}` | Looks up from hardcoded array |

### Where Index-Based Logic Lives

| Location | What it does | Problem |
|----------|-------------|---------|
| **Backend** | | |
| `models/user.ts` | `UserSettings.voiceIndex: number` (0-8) | Positional reference |
| `userService.ts → updateSettings()` | Validates `voiceIndex` between 0-8 | Hardcoded range |
| `userRoutes.ts → PATCH /users/me/settings` | Joi validates `voiceIndex: integer, min(0), max(8)` | Hardcoded range |
| `prayerRoutes.ts → POST /prayers` | Auto-TTS: `voices[authUser.settings?.voiceIndex ?? 0]` | Direct array index |
| `migrations/..._add-user-settings.js` | Default: `{"voiceIndex": 0, "playbackRate": 0.5}` | Index baked into schema |
| **iOS** | | |
| `UserSettings.swift` | `UserSettingsModel.voiceIndex: Int` | Positional reference |
| `UserSettings.swift` | `currentVoiceIndex` computed property | Returns index |
| `UserSettings.swift` | `updateVoiceIndex(_ index: Int)` | Sends index to backend |
| `UserSettings.swift` | `syncFromUser()` | Reads `user.settings.voiceIndex` |
| `VoiceService.swift` | `getVoiceByIndex(_ index: Int)` | Array subscript |
| `VoiceService.swift` | `getCurrentVoice()` | Uses `currentVoiceIndex` |
| `VoiceService.swift` | `getTierBadge(for voiceIndex: Int)` | Hardcoded: `>2` = Pro, `>5` = Warrior |
| `VoiceSelectionView.swift` | `voiceItems` uses `enumerated()` + index comparison | Index = identity |
| `VoiceSelectionView.swift` | `maxVoiceIndex` hardcoded per tier (2/5/8) | Redundant tier gating |
| `VoiceSelectionView.swift` | `selectVoice(_ index: Int)` | Sends index |

### Current Hardcoded Voice Array (order matters!)

```
Index 0: Samantha      (apple, free)
Index 1: Daniel        (apple, free)
Index 2: Moira         (apple, free)
Index 3: Jenny         (azure, pro)
Index 4: Guy           (azure, pro)
Index 5: Sonia         (azure, pro)
Index 6: Ryan          (azure, prayer_warrior)
Index 7: Selene        (fishaudio, prayer_warrior)
Index 8: Jordan        (fishaudio, prayer_warrior)
Index 9: Golem         (fishaudio, prayer_warrior)
```

If you insert a voice at position 3, every Pro/Warrior user's saved `voiceIndex` now points at the wrong voice.

---

## New State (After)

### Data Flow: User Selects a Voice

```
iOS VoiceSelectionView
  → user taps "Jenny" row
  → calls UserSettings.updateSelectedVoice("en-US-JennyNeural")
  → sends PATCH /users/me/settings { selectedVoiceId: "en-US-JennyNeural" }
  → backend validates voice exists in DB + user tier allows it
  → stores in users.settings JSONB: {"selectedVoiceId": "en-US-JennyNeural", "playbackRate": 0.5}
  → next TTS request: backend does SELECT * FROM voices WHERE id = 'en-US-JennyNeural'
```

### New Database Schema

#### `voices` table (new)

```sql
CREATE TABLE voices (
  id              TEXT PRIMARY KEY,        -- provider's voice ID (e.g., 'en-US-JennyNeural')
  name            TEXT NOT NULL,           -- display name (e.g., 'Jenny')
  language        TEXT NOT NULL,           -- e.g., 'en-US'
  gender          TEXT,                    -- 'male', 'female', 'neutral'
  description     TEXT,                    -- UI description
  tier            TEXT NOT NULL,           -- 'free', 'pro', 'prayer_warrior'
  provider        TEXT NOT NULL,           -- 'apple', 'azure', 'fishaudio', 'openvoice'
  preview_file    TEXT,                    -- bundled filename for preview (e.g., 'jenny_neural')
  preview_url     TEXT,                    -- future: S3 URL for streaming preview
  is_active       BOOLEAN NOT NULL DEFAULT true,  -- soft disable without deleting
  sort_order      INTEGER NOT NULL DEFAULT 0,     -- controls display order in picker
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voices_tier ON voices(tier);
CREATE INDEX idx_voices_active ON voices(is_active) WHERE is_active = true;
```

#### `voice_profiles` table (new — for future OpenVoice cloning)

```sql
CREATE TABLE voice_profiles (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name          TEXT NOT NULL,           -- user-chosen name, e.g., "My Voice"
  reference_audio_s3_key TEXT,                   -- S3 key for uploaded voice clip
  embedding_s3_key      TEXT,                    -- S3 key for extracted speaker embedding
  base_voice_id         TEXT REFERENCES voices(id), -- which stock voice to use as TTS base
  status                TEXT NOT NULL DEFAULT 'processing', -- 'processing', 'ready', 'failed'
  error_message         TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_voice_profiles_user ON voice_profiles(user_id);
```

> Note: `voice_profiles` is included in the migration for future-proofing but won't be used until the OpenVoice integration. No backend code references it in Phase 1.

#### `users.settings` JSONB change

```
BEFORE: {"voiceIndex": 3, "playbackRate": 0.5}
AFTER:  {"selectedVoiceId": "en-US-JennyNeural", "playbackRate": 0.5}
```

#### Data Migration (within the migration file)

```sql
-- Map existing voiceIndex values to voice IDs
-- This runs AFTER the voices table is seeded

UPDATE users SET settings = settings
  || jsonb_build_object('selectedVoiceId',
    CASE (settings->>'voiceIndex')::int
      WHEN 0 THEN 'com.apple.voice.compact.en-US.Samantha'
      WHEN 1 THEN 'com.apple.voice.compact.en-GB.Daniel'
      WHEN 2 THEN 'com.apple.voice.compact.en-IE.Moira'
      WHEN 3 THEN 'en-US-JennyNeural'
      WHEN 4 THEN 'en-US-GuyNeural'
      WHEN 5 THEN 'en-GB-SoniaNeural'
      WHEN 6 THEN 'en-GB-RyanNeural'
      WHEN 7 THEN 'b347db033a6549378b48d00acb0d06cd'
      WHEN 8 THEN '6ccd48c2891d409092b298dc34db0480'
      WHEN 9 THEN 'f273648b2f6242d4bf6ede2ccc4a525a'
      ELSE 'com.apple.voice.compact.en-US.Samantha'
    END
  )
WHERE settings ? 'voiceIndex';

-- Remove old voiceIndex key
UPDATE users SET settings = settings - 'voiceIndex';

-- Update default for new users
ALTER TABLE users ALTER COLUMN settings
  SET DEFAULT '{"selectedVoiceId": "com.apple.voice.compact.en-US.Samantha", "playbackRate": 0.5}';
```

---

## API Contract Changes

### `GET /voices` (modified)

**Before response:**
```json
{
  "userTier": "pro",
  "availableVoices": [ ... hardcoded array filtered by tier ],
  "allVoices": [ ... full hardcoded array ],
  "count": { "available": 6, "total": 9 }
}
```

**After response:**
```json
{
  "userTier": "pro",
  "availableVoices": [
    {
      "id": "com.apple.voice.compact.en-US.Samantha",
      "name": "Samantha",
      "language": "en-US",
      "gender": "female",
      "description": "Natural American English voice",
      "tier": "free",
      "provider": "apple",
      "previewFile": "samantha_preview",
      "previewUrl": null,
      "sortOrder": 0
    }
  ],
  "allVoices": [ ... all active voices from DB ordered by sort_order ],
  "count": { "available": 6, "total": 10 }
}
```

Shape is nearly identical — iOS `VoiceOption` struct barely changes (add `sortOrder`, rename `file` → `previewFile`).

### `PATCH /users/me/settings` (modified)

**Before payload:**
```json
{ "voiceIndex": 3 }
```

**After payload:**
```json
{ "selectedVoiceId": "en-US-JennyNeural" }
```

Backend validates that:
1. Voice exists in `voices` table
2. Voice `is_active = true`
3. User's tier allows this voice

### `GET /users/me/settings` (modified)

**Before response:**
```json
{ "voiceIndex": 3, "playbackRate": 0.5 }
```

**After response:**
```json
{ "selectedVoiceId": "en-US-JennyNeural", "playbackRate": 0.5 }
```

---

## File-by-File Change List

### Backend (tob-back)

| File | Change Type | What Changes |
|------|-------------|-------------|
| `src/migrations/XXXX_voices-table.js` | **NEW** | Creates `voices` table, seeds 10 stock voices, creates `voice_profiles` table, migrates `users.settings` from `voiceIndex` to `selectedVoiceId` |
| `src/models/ttsItems.ts` | **MODIFY** | Update `VoiceOption` interface: add `sortOrder`, `isActive`, `previewUrl`. Update `provider` union type to include `'openvoice'`. Remove `file` field, add `previewFile`. |
| `src/models/user.ts` | **MODIFY** | `UserSettings.voiceIndex` → `UserSettings.selectedVoiceId: string`. Update `DEFAULT_USER_SETTINGS`. |
| `src/controllers/ttsService.ts` | **MODIFY** | Delete `getAvailableVoices()` hardcoded array. Replace `getVoiceById()`, `getVoicesForTier()`, `canUserUseVoice()` with DB queries. |
| `src/controllers/userService.ts` | **MODIFY** | `updateSettings()`: replace `voiceIndex` 0-8 validation with voice ID validation (check exists in DB + tier check). |
| `src/routes/ttsRoutes.ts` | **MODIFY** | `GET /voices`: call DB-backed service methods instead of hardcoded. `GET /voices/preview/{voiceId}`: same. |
| `src/routes/userRoutes.ts` | **MODIFY** | `PATCH /users/me/settings`: Joi validation changes from `voiceIndex: number` to `selectedVoiceId: string`. |
| `src/routes/prayerRoutes.ts` | **MODIFY** | Auto-TTS on prayer create: replace `voices[authUser.settings?.voiceIndex ?? 0]` with `TTSService.getVoiceById(authUser.settings?.selectedVoiceId)`. |
| `terraform/variables.tf` | **MODIFY** | (future) Add `runpod_api_key`, `runpod_endpoint_url` variables for OpenVoice. |

### iOS (TowerOfBabble)

| File | Change Type | What Changes |
|------|-------------|-------------|
| `UserSettings.swift` | **MODIFY** | `UserSettingsModel`: `voiceIndex: Int` → `selectedVoiceId: String`. `updateVoiceIndex()` → `updateSelectedVoice(id:)`. `currentVoiceIndex` → `currentVoiceId`. Default changes to `"com.apple.voice.compact.en-US.Samantha"`. |
| `VoiceService.swift` | **MODIFY** | Delete `getVoiceByIndex()`. `getCurrentVoice()` → looks up by ID. Delete `getTierBadge(for voiceIndex:)` → new `getTierBadge(for voice: VoiceOption)` reads `voice.tier`. Delete `getVoiceDisplayNames()` (not needed, view uses voice objects directly). |
| `VoiceSelectionView.swift` | **MODIFY** | `voiceItems`: remove `enumerated()`, use `voice.id` for identity. `isSelected`: compare `voice.id == userSettings.currentVoiceId`. `selectVoice()`: pass voice ID not index. Delete `maxVoiceIndex`. Remove `getTierBadge(for: item.index)` → use `voice.tier` directly. |
| `VoicePreviewManager.swift` | **NO CHANGE** | Already works with `VoiceOption` objects and voice IDs. |
| `SettingsAPIService.swift` | **MODIFY** | `updateSettings()`: send `selectedVoiceId` instead of `voiceIndex`. |
| `User.swift` (model) | **MODIFY** | `UserSettingsResponse`: `voiceIndex` → `selectedVoiceId`. |
| Any view using `UserSettings.shared.currentVoiceIndex` | **MODIFY** | Replace with `currentVoiceId` references. |

---

## Build Order

### Phase 1: Backend Migration + Service (no iOS changes yet)

1. Write the migration file (voices table + seed + voice_profiles table + settings migration)
2. Update `models/user.ts` and `models/ttsItems.ts`
3. Refactor `ttsService.ts` to query DB
4. Update `userService.ts` validation
5. Update `userRoutes.ts` Joi schema
6. Update `ttsRoutes.ts` route handlers
7. Fix `prayerRoutes.ts` auto-TTS line
8. Test: `GET /voices` returns DB-backed voices, `PATCH /users/me/settings` accepts `selectedVoiceId`

**Backward compatibility note:** During the transition, the backend should accept BOTH `voiceIndex` (for old iOS clients) and `selectedVoiceId` (for updated clients). The migration converts all existing data, but users who haven't updated the app will still send `voiceIndex`. Add a compatibility shim in `updateSettings()` that converts index → ID using a DB lookup before storing.

### Phase 2: iOS Updates

1. Update `UserSettings.swift` model and methods
2. Update `VoiceService.swift` lookup methods
3. Update `VoiceSelectionView.swift` UI logic
4. Update `SettingsAPIService.swift` API call
5. Update any other views referencing `voiceIndex`
6. Test: voice selection round-trips correctly with new backend

### Phase 3: OpenVoice Integration (future)

1. Build RunPod GPU service (Python, Flask/FastAPI + OpenVoice V2)
2. Add voice profile upload endpoint to tob-back
3. Add `openvoice` provider case in `TTSService`
4. Worker Lambda calls Azure → then RunPod for cloned voices
5. iOS recording screen + voice profile management
6. Cloned voices appear in picker automatically (they're just rows in `voices` or `voice_profiles`)

---

## Key Design Decisions

**Why a `voices` table instead of just moving the array to a config file?**
Because voice_profiles (cloned voices) need to reference a base voice via foreign key, the `/voices` endpoint needs to be queryable by tier, and you'll want to add/disable voices from a future admin dashboard without redeploying.

**Why keep `voice_profiles` separate from `voices`?**
Stock voices are shared across all users. Cloned voices are per-user. Mixing them in one table would require user_id to be nullable and make every query more complex. Two tables, clean separation.

**Why store `selectedVoiceId` in the JSONB settings instead of a dedicated column?**
Consistency with your existing pattern. Settings is already JSONB with the merge operator (`||`). Adding a column works too, but means a schema change for every new preference. JSONB gives you flexibility. The tradeoff is you can't do a foreign key constraint from JSONB to the voices table — but the backend validates on write, so this is fine.

**Why accept both `voiceIndex` and `selectedVoiceId` during transition?**
App Store review takes days. You don't want a window where users on the old app version can't save voice preferences because the backend no longer accepts `voiceIndex`.