# 🗼 Tower of Babble - Backend Service

> **A prayer management and text-to-speech API for iOS mobile app**

---

## 📖 Table of Contents

- [What is Tower of Babble?](#what-is-tower-of-babble)
- [Tech Stack](#️-tech-stack)
- [Architecture Overview](#-architecture-overview)
- [Core Features](#-core-features)
- [API Responsibilities](#-api-responsibilities)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [Services Breakdown](#-services-breakdown)
- [Infrastructure](#️-infrastructure)
- [Development Setup](#-development-setup)
- [Deployment](#-deployment)
- [Testing](#-testing)
- [Environment Variables](#-environment-variables)

---

## 🙏 What is Tower of Babble?

Tower of Babble is an iOS prayer application that helps users create, save, and listen to prayers. The backend provides:

1. **User Authentication** - Secure login and registration
2. **Prayer Management** - Create, edit, delete, and organize prayers
3. **AI Prayer Generation** - Use OpenAI to generate custom prayers based on user preferences
4. **Text-to-Speech** - Convert prayers to audio using multiple TTS providers
5. **Audio Storage** - Store and stream prayer audio files
6. **Subscription Management** - Free and Pro tier features

### User Tiers

- **Free Tier**: Limited prayers, basic voice selection
- **Pro Tier**: 20 prayers, premium voices, custom prayer generation styles
- **Prayer Warrior Tier**: 50 prayers, all voice, yeah baby

---

## ⚙️ Tech Stack

### Backend Framework
- **Node.js 18+** with **TypeScript** - Type-safe, modern JavaScript
- **Hapi.js** - Web framework for building APIs

### Database & Caching
- **PostgreSQL** - Relational database for persistent storage
- **Redis** - In-memory cache for TTS build state tracking and session management

### AI & TTS Services
- **OpenAI GPT** - AI-powered prayer generation
- **Speechify API** - High-quality text-to-speech
- **Azure TTS** - Microsoft's neural text-to-speech
- **Fish Audio** - Alternative TTS provider

### Cloud Infrastructure (AWS)
- **AWS Lambda** - Serverless function hosting
- **API Gateway** - HTTP API endpoints
- **S3** - Audio file storage (`tob-audio-files-dev`)
- **SES** - Email service (activation, password reset)
- **CodePipeline** - CI/CD automation
- **CodeBuild** - Build and deployment
- **CloudWatch** - Logging and monitoring

### DevOps & Tools
- **Docker** - Containerized development environment
- **Terraform** - Infrastructure as Code (IaC)
- **Jest** - Unit and integration testing
- **node-pg-migrate** - Database migrations

---

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      iOS Mobile App                         │
│              (SwiftUI + API Service Layer)                  │
└─────────────────┬───────────────────────────────────────────┘
                  │ HTTP/REST
                  │ Bearer Token Auth
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              AWS API Gateway (HTTP API)                     │
│           Handles CORS, Throttling, Logging                 │
└─────────────────┬───────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│              AWS Lambda Function                            │
│           (Node.js 18 + Hapi.js Server)                     │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │              Routes Layer                          │    │
│  │  - loginRoutes    - prayerRoutes                   │    │
│  │  - userRoutes     - audioRoutes                    │    │
│  │  - ttsRoutes      - prayOnItRoutes                 │    │
│  │  - tokenRoutes    - passwordResetRoutes            │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────┐    │
│  │          Service/Controller Layer                  │    │
│  │  - authService      - prayerService                │    │
│  │  - userService      - aiService                    │    │
│  │  - ttsService       - audioService                 │    │
│  │  - s3Service        - emailService                 │    │
│  │  - tokenService     - redisService                 │    │
│  │  - postgresService  - prayerLimitService           │    │
│  └────────────────┬───────────────────────────────────┘    │
│                   │                                          │
│  ┌────────────────▼───────────────────────────────────┐    │
│  │              Models Layer                          │    │
│  │  - User          - Prayer                          │    │
│  │  - AIItems       - TTSItems                        │    │
│  │  - AudioItem     - PrayOnItItem                    │    │
│  └────────────────────────────────────────────────────┘    │
└───┬──────────────────┬──────────────────┬──────────────┬───┘
    │                  │                  │              │
    ▼                  ▼                  ▼              ▼
┌─────────┐    ┌─────────────┐    ┌──────────┐    ┌─────────┐
│PostgreSQL    │    Redis     │    │AWS S3    │    │External │
│ Database │    │   Cache      │    │ Audio    │    │  APIs   │
│          │    │              │    │ Storage  │    │         │
│ - users  │    │ - TTS state  │    │          │    │- OpenAI │
│ - prayers│    │ - Sessions   │    │ .mp3     │    │- Azure  │
│ - tokens │    │              │    │ files    │    │- Fish   │
│ - convos │    │              │    │          │    │-Speechfy│
└─────────┘    └─────────────┘    └──────────┘    └─────────┘
```

### Request Flow Example: "Create AI Prayer"

1. **User** opens app → taps "Generate Prayer with AI"
2. **iOS App** sends `POST /prayers/ai-gen` with JWT token
3. **API Gateway** validates request, passes to Lambda
4. **Lambda** → `prayerRoutes.ts` → `aiService.ts`
5. **aiService** calls **OpenAI API** with user preferences
6. **OpenAI** returns generated prayer text
7. **prayerService** saves prayer to **PostgreSQL**
8. **Response** returned to iOS app
9. **User** can now play prayer → triggers TTS flow

---

## 🎯 Core Features

### 1. User Authentication & Management
- JWT-based authentication (Bearer tokens)
- Email verification (activation links via AWS SES)
- Password reset functionality
- User settings and preferences
- Free vs Pro tier management

### 2. Prayer Management (CRUD)
- **Create** custom prayers or AI-generated ones
- **Read** all user prayers with metadata
- **Update** prayer title, text, and category
- **Delete** prayers
- Prayer limit enforcement (Free: 10, Pro: 20, prayerwarrior: 50)
- Playback tracking

### 3. AI Prayer Generation
- **OpenAI Integration** - GPT-powered prayer creation
- User-configurable parameters:
  - Prayer type (gratitude, intercession, petition, confession, praise)
  - Tone (formal, conversational, contemplative, joyful)
  - Length (short, medium, long)
  - Expansiveness (concise, moderate, expansive)
  - Custom context
- Conversation history tracking

### 4. Text-to-Speech (Multi-Provider)
- **Speechify** - Primary provider, premium voices
- **Azure TTS** - Neural voices, wide language support
- **Fish Audio** - Alternative provider
- Voice selection per prayer
- Audio file caching (S3 storage)
- Streaming support

### 5. "Pray On It" Feature
- Pre-built prayer templates
- Common prayer structures
- Seed data for new users

### 6. Subscription & Limits
- Free tier: 10 prayers max
- Pro tier: Unlimited prayers
- Stripe integration (ready for payment processing)
- Tier-based feature gating

---

## 🧩 API Responsibilities

This backend service handles:

1. **User Registration & Login**
   - Bcrypt password hashing
   - JWT token generation and validation
   - Email activation workflows

2. **Prayer CRUD Operations**
   - Creating, reading, updating, deleting prayers
   - Enforcing tier-based limits
   - Tracking usage statistics

3. **AI Content Generation**
   - OpenAI API integration
   - Prompt engineering for prayers
   - Conversation context management

4. **Audio Generation**
   - Multi-provider TTS orchestration
   - Audio file storage in S3
   - Pre-signed URL generation for streaming

5. **Email Notifications**
   - Account activation emails
   - Password reset emails
   - Using AWS SES

6. **State Management**
   - Redis caching for TTS jobs
   - Session management
   - Real-time build status tracking

---

## 📁 Project Structure

```
tob-back/
├── src/                          # TypeScript source code
│   ├── app.ts                    # Main Hapi server setup
│   ├── controllers/              # Business logic layer
│   │   ├── aiService.ts          # OpenAI integration
│   │   ├── audioService.ts       # Audio file management
│   │   ├── authService.ts        # Authentication logic
│   │   ├── email.service.ts      # AWS SES email sending
│   │   ├── postgres.service.ts   # Database connection
│   │   ├── prayerService.ts      # Prayer CRUD operations
│   │   ├── prayerLimitService.ts # Tier enforcement
│   │   ├── prayOnItService.ts    # Prayer templates
│   │   ├── redis.service.ts      # Redis operations
│   │   ├── s3.service.ts         # S3 file operations
│   │   ├── tokenService.ts       # JWT token handling
│   │   ├── ttsService.ts         # TTS provider orchestration
│   │   └── userService.ts        # User management
│   ├── models/                   # Data models
│   │   ├── user.ts               # User model
│   │   ├── prayer.ts             # Prayer model
│   │   ├── audioItem.ts          # Audio metadata model
│   │   ├── aiItems.ts            # AI conversation history
│   │   ├── ttsItems.ts           # TTS job tracking
│   │   └── prayOnItItem.ts       # Prayer template model
│   ├── routes/                   # API endpoints
│   │   ├── index.ts              # Route aggregator
│   │   ├── loginRoutes.ts        # POST /login, /register
│   │   ├── userRoutes.ts         # GET /users/me, /stats
│   │   ├── prayerRoutes.ts       # CRUD /prayers/*
│   │   ├── audioRoutes.ts        # GET /audio/:id
│   │   ├── ttsRoutes.ts          # POST /tts/generate
│   │   ├── prayOnItRoutes.ts     # GET /pray-on-its
│   │   ├── tokenRoutes.ts        # POST /verify-token
│   │   ├── passwordResetRoutes.ts# POST /reset-password
│   │   └── redisRoutes.ts        # Redis debugging routes
│   ├── migrations/               # Database schema changes
│   │   ├── 1765231026799_users-prayers-tokens.js
│   │   ├── 1765247785790_drop-credits.js
│   │   ├── 1765832590077_pray-on-it.js
│   │   ├── 1765921573484_add-user-settings.js
│   │   ├── 1766088281004_drop-prayer-deleted.js
│   │   ├── 1766100195335_ai-convos.js
│   │   ├── 1767459884768_audio-url.js
│   │   └── 1767821478493_reset-token.js
│   ├── scripts/                  # Utility scripts
│   │   ├── seedUsers.ts          # Create test users
│   │   ├── seedPrayOnIts.ts      # Load prayer templates
│   │   └── seedAllEntry.ts       # Full database seed
│   ├── tests/                    # Unit tests
│   │   ├── authService.test.ts
│   │   ├── postgresService.test.ts
│   │   ├── prayerService.test.ts
│   │   └── userService.test.ts
│   └── public/                   # Static files
│       └── activation-success.html
├── dist/                         # Compiled JavaScript (build output)
├── terraform/                    # Infrastructure as Code
│   ├── main.tf                   # Lambda, API Gateway, etc.
│   ├── iam.tf                    # IAM roles and policies
│   ├── backend.tf                # Terraform backend config
│   ├── variables.tf              # Input variables
│   └── outputs.tf                # Stack outputs
├── docker-compose.yml            # Local development environment
├── Dockerfile                    # Multi-stage Docker build
├── buildspec.yml                 # AWS CodeBuild configuration
├── deploy.js                     # Lambda deployment script
├── init-db.sql                   # Initial database setup
├── package.json                  # Node.js dependencies
├── tsconfig.json                 # TypeScript configuration
├── jest.config.js                # Jest testing configuration
├── Makefile                      # Development shortcuts
└── README.md                     # This file!
```

### Key Directories Explained

- **`src/`** - All TypeScript source code lives here
  - **`controllers/`** - Business logic, external API calls, database operations
  - **`routes/`** - HTTP endpoint definitions (like "pages" but for APIs)
  - **`models/`** - Data structures (what a User, Prayer, etc. looks like)
  - **`migrations/`** - Database schema changes over time
  - **`tests/`** - Automated tests to ensure code works correctly

- **`dist/`** - Compiled JavaScript code (TypeScript → JavaScript)
  - This is what actually runs in production
  - Generated by `npm run build`

- **`terraform/`** - Infrastructure definitions
  - Describes AWS resources (Lambda, API Gateway, S3, etc.)
  - Used to create/update cloud infrastructure

---

## 🗄 Database Schema

### Core Tables

#### **users**
```sql
- id (UUID, primary key)
- email (unique, not null)
- password_hash (bcrypt hashed)
- name
- tier ('free' | 'pro')
- is_active (email verified?)
- stripe_customer_id
- subscription_expires_at
- created_at, updated_at
```

#### **prayers**
```sql
- id (UUID, primary key)
- user_id (foreign key → users.id)
- title (text)
- text (text, the actual prayer content)
- category (optional: gratitude, petition, etc.)
- play_count (how many times played)
- audio_url (S3 URL for TTS audio)
- created_at, updated_at
```

#### **tokens**
```sql
- id (UUID, primary key)
- user_id (foreign key → users.id)
- token (JWT string or activation token)
- type ('activation' | 'password_reset' | 'auth')
- expires_at
- used_at (null until consumed)
- created_at
```

#### **pray_on_it_items**
```sql
- id (UUID, primary key)
- title
- text (pre-written prayer template)
- category
- is_active (visible to users?)
- created_at, updated_at
```

#### **ai_conversations**
```sql
- id (UUID, primary key)
- user_id (foreign key → users.id)
- prayer_id (foreign key → prayers.id)
- conversation_history (JSON, OpenAI message history)
- created_at, updated_at
```

#### **audio_items**
```sql
- id (UUID, primary key)
- prayer_id (foreign key → prayers.id)
- audio_url (S3 storage path)
- voice_id
- provider ('speechify' | 'azure' | 'fish')
- duration_seconds
- file_size_bytes
- created_at
```

#### **tts_items**
```sql
- id (UUID, primary key)
- prayer_id (foreign key → prayers.id)
- status ('pending' | 'processing' | 'completed' | 'failed')
- provider
- voice_id
- audio_url
- error_message (if failed)
- created_at, updated_at
```

---

## 🛠 Services Breakdown

### **authService.ts**
**Purpose**: Handle user authentication and authorization

**Key Functions**:
- `register(email, password, name)` - Create new user account
- `login(email, password)` - Authenticate user, return JWT
- `verifyToken(token)` - Validate JWT token
- `hashPassword(password)` - Bcrypt hashing
- `comparePassword(plain, hashed)` - Verify password

**Used By**: `loginRoutes.ts`, all authenticated endpoints

---

### **userService.ts**
**Purpose**: Manage user accounts and preferences

**Key Functions**:
- `getUserById(id)` - Fetch user details
- `updateUser(id, data)` - Update user profile
- `deleteUser(id)` - Remove user account
- `getUserStats(id)` - Get prayer count, tier info
- `activateUser(token)` - Email verification

**Used By**: `userRoutes.ts`, `authService.ts`

---

### **prayerService.ts**
**Purpose**: Core prayer CRUD operations

**Key Functions**:
- `createPrayer(userId, title, text)` - Add new prayer
- `getPrayers(userId)` - Fetch all user prayers
- `getPrayerById(id)` - Get single prayer
- `updatePrayer(id, data)` - Edit prayer
- `deletePrayer(id)` - Remove prayer
- `incrementPlayCount(id)` - Track usage

**Used By**: `prayerRoutes.ts`, `audioRoutes.ts`

---

### **aiService.ts**
**Purpose**: Generate prayers using OpenAI

**Key Functions**:
- `generatePrayer(userId, params)` - Call OpenAI API
- `buildPrompt(type, tone, length, items, context)` - Craft prompt
- `saveConversationHistory(userId, prayerId, history)` - Track AI chats

**Dependencies**: OpenAI API key, PostgreSQL (conversation storage)

**Used By**: `prayerRoutes.ts` (`POST /prayers/ai-gen`)

**Example Flow**:
```
User selects: type=gratitude, tone=joyful, items=["family", "health"]
→ aiService builds prompt
→ OpenAI generates: "Dear Lord, with a heart full of joy..."
→ Prayer saved to database
→ User can now listen to it
```

---

### **ttsService.ts**
**Purpose**: Convert text to speech audio

**Key Functions**:
- `generateAudio(text, voiceId, provider)` - Call TTS provider
- `selectProvider(voiceId)` - Route to Speechify/Azure/Fish
- `uploadToS3(audioData, filename)` - Store audio file
- `getAudioUrl(prayerId)` - Retrieve S3 URL

**Providers Supported**:
- **Speechify** - High-quality, celebrity voices
- **Azure TTS** - Neural voices, 120+ languages
- **Fish Audio** - Backup provider

**Used By**: `ttsRoutes.ts`, `audioRoutes.ts`

---

### **audioService.ts**
**Purpose**: Manage audio file metadata and playback

**Key Functions**:
- `getAudioForPrayer(prayerId)` - Fetch audio metadata
- `trackPlayback(prayerId, userId)` - Update play count
- `deleteAudio(prayerId)` - Remove audio file from S3

**Used By**: `audioRoutes.ts`, mobile app audio player

---

### **s3Service.ts**
**Purpose**: AWS S3 file storage operations

**Key Functions**:
- `uploadFile(buffer, key, contentType)` - Store file in S3
- `getSignedUrl(key, expiresIn)` - Generate temporary download URL
- `deleteFile(key)` - Remove file from S3
- `listFiles(prefix)` - List files in bucket

**Configuration**: Bucket name from env var (`S3_AUDIO_BUCKET`)

---

### **emailService.ts**
**Purpose**: Send emails via AWS SES

**Key Functions**:
- `sendActivationEmail(email, token)` - New user verification
- `sendPasswordResetEmail(email, token)` - Reset password link
- `sendWelcomeEmail(email, name)` - Post-activation

**Templates**: HTML emails with branded styling

---

### **redisService.ts**
**Purpose**: Cache and real-time state management

**Key Functions**:
- `set(key, value, ttl)` - Store data with expiration
- `get(key)` - Retrieve cached data
- `delete(key)` - Remove cache entry
- `setTTSStatus(prayerId, status)` - Track TTS job state

**Use Cases**:
- TTS generation status (`processing`, `completed`, `failed`)
- Session management
- Rate limiting

---

### **prayerLimitService.ts**
**Purpose**: Enforce tier-based prayer limits

**Key Functions**:
- `canCreatePrayer(userId)` - Check if user can add more prayers
- `getPrayerStats(userId)` - Return current/limit/remaining
- `enforceLimit(userId)` - Throw error if limit exceeded

**Limits**:
- Free: 10 prayers
- Pro: Unlimited

---

### **tokenService.ts**
**Purpose**: JWT and activation token management

**Key Functions**:
- `generateJWT(userId)` - Create auth token
- `verifyJWT(token)` - Validate and decode token
- `generateActivationToken(userId)` - Email verification token
- `generateResetToken(userId)` - Password reset token
- `consumeToken(token)` - Mark token as used

---

### **postgresService.ts**
**Purpose**: Database connection and query execution

**Key Functions**:
- `query(sql, params)` - Execute SQL query
- `transaction(callback)` - Run queries in transaction
- `getPool()` - Get connection pool

**Configuration**: Uses `DATABASE_URL` environment variable

---

## ☁️ Infrastructure

### AWS Architecture

```
GitHub Repo (Code Push)
    ↓
AWS CodePipeline
    ↓
AWS CodeBuild (runs buildspec.yml)
    ├─ npm install
    ├─ npm run build (TypeScript → JavaScript)
    ├─ npm run migrate:up (database migrations)
    └─ node deploy.js (zip + upload to Lambda)
    ↓
AWS Lambda Function (towerofbabble)
    ↓
API Gateway (HTTPS endpoints)
    ↓
Mobile App
```

### Infrastructure Components

#### **AWS Lambda**
- **Runtime**: Node.js 18
- **Memory**: Configurable (default 1024MB)
- **Timeout**: 30 seconds
- **Environment Variables**: Loaded from terraform.tfvars

#### **API Gateway (HTTP API)**
- **Type**: HTTP API (simpler, cheaper than REST API)
- **CORS**: Enabled for iOS app
- **Throttling**: 2000 req/sec, 5000 burst
- **Logging**: CloudWatch integration

#### **S3 Buckets**
1. **`tob-audio-files-dev`** - Prayer audio files
2. **`tob-pipeline-artifacts`** - CodePipeline build artifacts

#### **RDS PostgreSQL** (in production)
- **Engine**: PostgreSQL 15
- **Connection**: Via `DATABASE_URL` env var
- **Backup**: Automated daily snapshots

#### **ElastiCache Redis** (in production)
- **Engine**: Redis 7
- **Connection**: `REDIS_HOST`, `REDIS_PORT`
- **Persistence**: AOF enabled

---

## 🚀 Development Setup

### Prerequisites

- **Node.js 18+** (`node -v` to check)
- **Docker Desktop** (for local database)
- **Git** (obviously!)
- **AWS CLI** (for deployment)

### Step 1: Clone Repository

```bash
git clone <repo-url>
cd tob-back
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Environment Variables

Create `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Database
DATABASE_URL=postgres://tobapp:tobapp@localhost:5434/towerofbabble

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=your-super-secret-key-change-this

# OpenAI
OPENAI_API_KEY=sk-...

# TTS Providers
SPEECHIFY_API_KEY=...
AZURE_TTS_API_KEY=...
AZURE_TTS_REGION=eastus
FISH_API_KEY=...

# AWS
AWS_REGION=us-east-2
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_AUDIO_BUCKET=tob-audio-files-dev

# Email
FROM_EMAIL=noreply@towerofbabble.app
APP_URL=https://app.towerofbabble.com

# Server
PORT=3004
NODE_ENV=development
```

### Step 4: Start Local Services (Docker)

```bash
docker-compose up -d
```

This starts:
- **PostgreSQL** on port 5434
- **Redis** on port 6379

### Step 5: Run Database Migrations

```bash
npm run migrate:up
```

### Step 6: Seed Database (Optional)

```bash
npm run seed:users    # Create test users
npm run seed:pois     # Load prayer templates
```

### Step 7: Start Development Server

```bash
npm run dev
```

Server runs on `http://localhost:3004`

Test with:
```bash
curl http://localhost:3004/health
```

---

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Watch Mode (auto-run on file changes)

```bash
npm run test:watch
```

### Coverage Report

```bash
npm run test:coverage
```

### Test Structure

```
src/tests/
├── authService.test.ts      # Login, registration, JWT
├── postgresService.test.ts  # Database queries
├── prayerService.test.ts    # Prayer CRUD
└── userService.test.ts      # User management
```

---

## 📦 Deployment

### Automatic Deployment (CI/CD)

Push to `main` branch:

```bash
git push origin main
```

**Pipeline Flow**:
1. CodePipeline detects push
2. CodeBuild runs `buildspec.yml`
   - Install dependencies
   - Build TypeScript
   - Run migrations
   - Deploy to Lambda
3. Lambda updated with new code
4. API Gateway routes traffic to new version

### Manual Deployment

```bash
# Build code
npm run build

# Run deploy script
FUNCTION_NAME=towerofbabble ALIAS=prod node deploy.js
```

### Infrastructure Updates (Terraform)

```bash
cd terraform

# Initialize Terraform
terraform init

# Review changes
terraform plan

# Apply changes
terraform apply
```

---

## 🔒 Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgres://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret key for JWT signing | `your-secret-key-min-32-chars` |
| `OPENAI_API_KEY` | OpenAI API key | `sk-...` |
| `AWS_REGION` | AWS region | `us-east-2` |
| `AWS_ACCESS_KEY_ID` | AWS credentials | `AKIA...` |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials | `...` |
| `S3_AUDIO_BUCKET` | S3 bucket name | `tob-audio-files-dev` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3004` |
| `NODE_ENV` | Environment | `development` |
| `REDIS_HOST` | Redis host | `localhost` |
| `REDIS_PORT` | Redis port | `6379` |
| `FROM_EMAIL` | Email sender | `noreply@domain.com` |
| `APP_URL` | App URL for emails | `https://domain.com` |

### TTS Provider Keys (Optional)

```env
SPEECHIFY_API_KEY=...
AZURE_TTS_API_KEY=...
AZURE_TTS_REGION=eastus
FISH_API_KEY=...
```

---

## 📝 API Endpoints

### Authentication

- `POST /register` - Create new account
- `POST /login` - Authenticate user
- `POST /verify-token` - Validate JWT
- `POST /activate/:token` - Verify email
- `POST /reset-password` - Request password reset
- `POST /reset-password/confirm` - Confirm reset

### User Management

- `GET /users/me` - Get current user
- `GET /users/stats` - Get prayer statistics
- `PUT /users/me` - Update user profile
- `DELETE /users/me` - Delete account

### Prayers

- `GET /prayers` - List all prayers
- `GET /prayers/:id` - Get single prayer
- `POST /prayers` - Create prayer
- `POST /prayers/ai-gen` - Generate AI prayer
- `PUT /prayers/:id` - Update prayer
- `DELETE /prayers/:id` - Delete prayer
- `POST /prayers/:id/play` - Record playback

### Audio

- `GET /prayers/:id/audio` - Get audio metadata
- `POST /prayers/:id/generate-audio` - Generate TTS audio
- `GET /audio/:id` - Stream audio file

### Prayer Templates

- `GET /pray-on-its` - List templates
- `GET /pray-on-its/:id` - Get template

---

## 🤝 Related Repositories

- **Frontend (iOS)**: `TowerOfBabble` - SwiftUI mobile app
- **Admin Dashboard**: (Coming soon)

---

## 🐛 Troubleshooting

### Database Connection Errors

```bash
# Check if PostgreSQL is running
docker-compose ps

# Restart database
docker-compose restart postgres

# View logs
docker-compose logs postgres
```

### Redis Connection Errors

```bash
# Test Redis connection
redis-cli -h localhost -p 6379 ping
# Should return: PONG

# Restart Redis
docker-compose restart redis
```

### Lambda Deployment Fails

```bash
# Check AWS credentials
aws sts get-caller-identity

# View CodeBuild logs
aws logs tail /aws/codebuild/towerofbabble --follow
```

---

## 📄 License

This project is **UNLICENSED** and not available for public reuse.

---

## 👨‍💻 Author

**Jordan Duffey**
- Email: [contact info]
- GitHub: [@jordanduffey]

---

## 📚 Additional Resources

- [Hapi.js Documentation](https://hapi.dev/)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [AWS Lambda Developer Guide](https://docs.aws.amazon.com/lambda/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [OpenAI API Reference](https://platform.openai.com/docs/)