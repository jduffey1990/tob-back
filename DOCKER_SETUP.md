# Tower of Babble - Docker Setup

## Quick Start

### 1. First Time Setup

```bash
# Start everything (builds images first time)
docker-compose up -d

# Check if containers are running
docker-compose ps

# View logs
docker-compose logs -f api
```

### 2. Run Database Migrations

```bash
# Once containers are up, run migrations
# Option A: Inside the container
docker-compose exec api npm run migrate:up

# Option B: From your host machine (make sure .env has localhost:5433)
npm run migrate:up
```

### 3. Seed Initial Data (Optional)

```bash
# Create test users
docker-compose exec api npm run seed:users
```

## Port Mapping

| Service  | Internal | External (Your Machine) | URL                    |
|----------|----------|-------------------------|------------------------|
| API      | 3000     | 3004                    | http://localhost:3004  |
| Postgres | 5432     | 5434                    | localhost:5434         |

**Why different ports?**
- Avoids conflicts with your other services:
  - postgres-docker-local: 5432
  - postgres-companies-local: 5433
  - services-users: 3001
  - services-brandora-verify: 3002
  - services-companies: 3003
- iOS Simulator will connect to `http://localhost:3004`
- Real iOS device on same WiFi: `http://YOUR_MAC_IP:3004`

## Common Commands

### Start/Stop Services

```bash
# Start all services
docker-compose up -d

# Stop all services (keeps data)
docker-compose down

# Stop and remove volumes (DELETES DATABASE!)
docker-compose down -v

# Restart just the API (after code changes)
docker-compose restart api

# Rebuild after Dockerfile changes
docker-compose up -d --build
```

### Viewing Logs

```bash
# All services
docker-compose logs -f

# Just API
docker-compose logs -f api

# Just Postgres
docker-compose logs -f postgres

# Last 100 lines
docker-compose logs --tail=100 api
```

### Database Operations

```bash
# Connect to Postgres CLI inside container
docker-compose exec postgres psql -U tobapp -d towerofbabble

# Connect from your Mac (requires psql installed)
psql -h localhost -p 5434 -U tobapp -d towerofbabble

# Run migrations
docker-compose exec api npm run migrate:up

# Rollback last migration
docker-compose exec api npm run migrate:down

# Reset all migrations (DANGEROUS!)
docker-compose exec api npm run migrate:reset
```

### Development Workflow

```bash
# Start services
docker-compose up -d

# Watch API logs (auto-reloads on file changes)
docker-compose logs -f api

# Run tests
docker-compose exec api npm test

# Access API shell
docker-compose exec api sh
```

## Running Backend WITHOUT Docker

If you prefer to run the Node.js backend on your Mac directly:

```bash
# 1. Start just Postgres
docker-compose up -d postgres

# 2. Update your .env to point to localhost:5434
DATABASE_URL=postgres://tobapp:tobapp@localhost:5434/towerofbabble

# 3. Run backend normally
npm run dev

# 4. Backend runs on http://localhost:3000 (not 3001!)
```

## iOS App Configuration

### For iOS Simulator (Backend in Docker)
```swift
let baseURL = "http://localhost:3004"
```

### For iOS Simulator (Backend on Host)
```swift
let baseURL = "http://localhost:3000"
```

### For Real iPhone (on same WiFi)
```bash
# Find your Mac's IP
ipconfig getifaddr en0  # WiFi
# Returns something like: 192.168.1.45
```

```swift
let baseURL = "http://192.168.1.45:3004"  // Use your actual IP
```

## Troubleshooting

### Postgres won't start (port conflict)
```bash
# Check what's using port 5434
lsof -i :5434

# If something else is using it, you can either:
# 1. Stop that service
# 2. Change Tower of Babble to use port 5435 in docker-compose.yml
```

### API won't connect to Postgres
```bash
# Check if Postgres is healthy
docker-compose ps

# Should show "healthy" status
# If not, check logs:
docker-compose logs postgres

# Common fix: wait for Postgres to be ready
docker-compose restart api
```

### Hot reload not working
```bash
# Make sure you're mounting source code
# Check docker-compose.yml volumes:
#   - ./src:/app/src

# Restart with rebuild
docker-compose down
docker-compose up -d --build
```

### Need to reset everything
```bash
# Nuclear option: remove everything
docker-compose down -v
docker-compose up -d --build

# Then re-run migrations
docker-compose exec api npm run migrate:up
```

## Database Inspection

### Using TablePlus / Postico / pgAdmin
```
Host:     localhost
Port:     5434
User:     tobapp
Password: tobapp
Database: towerofbabble
```

### Quick SQL Queries
```bash
docker-compose exec postgres psql -U tobapp -d towerofbabble -c "SELECT * FROM users;"
```

## Next Steps

1. ✅ Docker setup complete
2. 🔲 Run migrations to create `users` table
3. 🔲 Create `prayers` table migration
4. 🔲 Test endpoints with Postman/curl
5. 🔲 Connect iOS app to `http://localhost:3001`

---

**Questions?** Check logs with `docker-compose logs -f` or DM Jordan.