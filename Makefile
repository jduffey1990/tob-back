# Makefile for Tower of Babble Development
.PHONY: help up down logs shell db migrate-up migrate-down migrate-create test clean rebuild

help: ## Show this help message
	@echo "Tower of Babble - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'

up: ## Start all services
	docker-compose up -d
	@echo "✅ Services started!"
	@echo "API: http://localhost:3004"
	@echo "Postgres: localhost:5434"

down: ## Stop all services (keeps data)
	docker-compose down

logs: ## Show API logs (follow)
	docker-compose logs -f api

logs-all: ## Show all service logs
	docker-compose logs -f

shell: ## Open shell in API container
	docker-compose exec api sh

db: ## Connect to Postgres CLI
	docker-compose exec postgres psql -U tobapp -d towerofbabble

db-host: ## Connect to Postgres from host (requires psql installed)
	psql -h localhost -p 5434 -U tobapp -d towerofbabble

migrate-up: ## Run all pending migrations
	docker-compose exec api npm run migrate:up

migrate-down: ## Rollback last migration
	docker-compose exec api npm run migrate:down

migrate-create: ## Create new migration (use: make migrate-create name=add-prayers-table)
	docker-compose exec api npm run migrate:create $(name)

seed: ## Seed database with test data
	docker-compose exec api npm run seed:users

test: ## Run tests
	docker-compose exec api npm test

test-watch: ## Run tests in watch mode
	docker-compose exec api npm run test:watch

clean: ## Stop services and remove volumes (DELETES DATA!)
	docker-compose down -v
	@echo "⚠️  Database wiped!"

rebuild: ## Rebuild and restart services
	docker-compose down
	docker-compose up -d --build
	@echo "✅ Services rebuilt!"

status: ## Show status of all services
	docker-compose ps

restart: ## Restart API service
	docker-compose restart api

# First-time setup
setup: ## First-time setup (run migrations, seed data)
	@echo "🚀 Setting up Tower of Babble..."
	make up
	@echo "⏳ Waiting for Postgres to be ready..."
	@sleep 5
	make migrate-up
	@echo "✅ Setup complete!"
	@echo "Run 'make logs' to see what's happening"