# WebGuard local development. Run `make` to see the commands.
# Needs Docker (for Supabase) and Node 22+. If `node` is older, pass NODE=/path/to/node.

.DEFAULT_GOAL := help
.PHONY: help up start stop down restart status logs check migrate worker-image

help: ## Show this help
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*## "} {printf "  \033[36mmake %-13s\033[0m %s\n", $$1, $$2}'

up: ## Start Supabase, the web app and the scan worker (applies new migrations)
	@NODE="$(NODE)" PORT="$(PORT)" bash scripts/dev.sh up

start: up ## Same as up

stop: ## Stop the web app and the worker (Supabase keeps running)
	@PORT="$(PORT)" bash scripts/dev.sh stop

down: ## Stop everything, including Supabase (database data is kept)
	@PORT="$(PORT)" bash scripts/dev.sh down

restart: stop up ## Stop, then start again

status: ## Show what is running
	@PORT="$(PORT)" bash scripts/dev.sh status

logs: ## Follow web and worker logs (Ctrl+C to exit)
	@bash scripts/dev.sh logs

migrate: ## Apply new database migrations to local Supabase
	@npx --no-install supabase migration up

check: ## Tests, typecheck and lint (no `next build`, so it's safe while the dev server runs)
	@npm test && npm run typecheck && npm run lint

worker-image: ## Build the scan worker Docker image (webguard-worker:local)
	@docker build -f Dockerfile.worker -t webguard-worker:local .

PORT ?= 3000
NODE ?=
