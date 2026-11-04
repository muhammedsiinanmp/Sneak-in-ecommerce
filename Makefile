# SneakIn — repository command interface.
#
# §2.6: the Makefile is the interface, and any operation performed more than once must be a
# target. I §18.1 / I §18.7: the intended command surface and full target list.
#
# Phase 0: only commands backed by today's repository are defined. Each target either runs its
# real check or states exactly why it cannot and stops. No target reports a pass for work it
# did not perform (§15.6).

SHELL := /bin/bash
.DEFAULT_GOAL := help

BACKEND   := backend
FRONTEND := e-commerce-app
SERVICES  := services
TERRAFORM := infra/terraform

# backend/venv entry-point scripts still carry the shebang of the old project path, so tools
# are invoked as `python -m <tool>`. The interpreter itself is a working symlink.
PY := $(BACKEND)/venv/bin/python

# Service selector for targets that act on one compose service (I §18.5).
S ?= backend

.PHONY: help check fmt fmt-check lint lint-frontend build-frontend test dev ps logs shell setup migrate superuser lint-terraform validate-terraform

help: ## Show this help
	@echo "SneakIn repository commands  (§2.6 — the Makefile is the interface)"
	@echo ""
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort -u | awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "First run:  make setup   then   make dev   then   make migrate"
	@echo "Targets from I §18.7 that are not defined yet, and why:"
	@echo "  later phases  bootstrap build build-* deploy contract-test"
	@echo "  later phases  e2e e2e-headed smoke chaos reset-data test-race"
	@echo "  data          seed reset-admin rotate-keys backup-db restore-db"
	@echo "  observability metrics dashboards"
	@echo "  Phase 7       scan-terraform"
	@echo ""
	@echo "Phase 0 additions beyond I §18.7: setup, superuser, fmt-check, lint-frontend,"
	@echo "build-frontend, check, help. They exist so the root README holds no manual"
	@echo "sequence (§13.2) and so make check covers both CI jobs (§2.6)."
	@echo ""
	@echo "Known red today — all pre-existing, none introduced by Phase 0:"
	@echo "  make fmt-check      2 Python files are not black-formatted (CI does not run black)"
	@echo "  make lint-frontend  13 eslint errors (CI does not run eslint)"
	@echo "  make test           needs the compose stack: make dev"
	@echo ""
	@echo "make check runs fmt-check, lint, lint-frontend and test. CI enforces only a subset"
	@echo "of these today (.github/workflows/ci.yml: 2 jobs, versus 26 in I §12.1)."

check: fmt-check lint lint-frontend build-frontend test ## Pre-flight: format check + linters + build + tests
	@echo "check: PASS"

fmt: ## Apply formatters (black, gofmt, terraform fmt)
	@if [ ! -x "$(PY)" ]; then echo "ERROR: $(PY) not found — cannot format Python"; exit 2; fi
	@echo "black: $(BACKEND)/apps"
	@$(PY) -m black $(BACKEND)/apps
	@if files=$$(find $(SERVICES) -name '*.go' 2>/dev/null); [ -z "$$files" ]; then \
		echo "gofmt: 0 Go files under $(SERVICES) — nothing to format"; \
	else \
		gofmt -l -w $$files && echo "gofmt: applied"; \
	fi
	@if files=$$(find $(TERRAFORM) -name '*.tf' 2>/dev/null); [ -z "$$files" ]; then \
		echo "terraform fmt: 0 .tf files under $(TERRAFORM) — nothing to format"; \
	else \
		terraform fmt -recursive $(TERRAFORM) && echo "terraform fmt: applied"; \
	fi

fmt-check: ## Verify formatting without changing files
	@if [ ! -x "$(PY)" ]; then echo "ERROR: $(PY) not found — cannot check Python formatting"; exit 2; fi
	@$(PY) -m black --check --diff $(BACKEND)/apps
	@if files=$$(find $(SERVICES) -name '*.go' 2>/dev/null); [ -z "$$files" ]; then \
		echo "gofmt: 0 Go files under $(SERVICES) — nothing to check"; \
	else \
		out=$$(gofmt -l $$files); if [ -n "$$out" ]; then echo "$$out"; echo "gofmt: the files above need formatting"; exit 1; fi; echo "gofmt: OK"; \
	fi
	@if files=$$(find $(TERRAFORM) -name '*.tf' 2>/dev/null); [ -z "$$files" ]; then \
		echo "terraform fmt: 0 .tf files under $(TERRAFORM) — nothing to check"; \
	else \
		terraform fmt -check -recursive $(TERRAFORM) && echo "terraform fmt: OK"; \
	fi

lint: ## Backend lint — mirrors the CI job backend-test
	@if [ ! -x "$(PY)" ]; then echo "ERROR: $(PY) not found"; exit 2; fi
	@cd $(BACKEND) && venv/bin/python -m flake8 apps/ --count --show-source --statistics
	@echo "lint: flake8 passed (same command as .github/workflows/ci.yml backend-test)"

lint-frontend: ## Frontend lint (eslint) — not enforced by CI, failing today
	@command -v npm >/dev/null || { echo "ERROR: npm not found"; exit 2; }
	@cd $(FRONTEND) && npm run lint

build-frontend: ## Frontend production build — mirrors the CI job frontend-build
	@command -v npm >/dev/null || { echo "ERROR: npm not found"; exit 2; }
	@cd $(FRONTEND) && npm run build

test: ## Backend tests — mirrors the CI job backend-test; needs the compose stack
	@if ! docker compose ps >/dev/null 2>&1; then \
		echo "ERROR: the Docker daemon is not reachable."; \
		echo "  The suite needs Postgres 16 + Redis 7 (.github/workflows/ci.yml, I §10)."; \
		echo "  Start the stack:  make dev"; \
		echo "  Single command:   docker compose exec backend pytest   (AGENTS.md §7)"; \
		exit 2; \
	fi
	@if ! docker compose ps --status running 2>/dev/null | grep -q .; then \
		echo "ERROR: no compose services are running for this project."; \
		echo "  Start the stack:  make dev"; \
		exit 2; \
	fi
	@docker compose exec -T $(S) pytest

dev: ## Start the local stack: docker compose up --build (§2.8, I §18.5)
	docker compose up --build

ps: ## Local stack status (I §18.5)
	docker compose ps

logs: ## Tail logs for one service: make logs [S=<service>] (I §18.5)
	docker compose logs -f $(S)

shell: ## Shell into a service: make shell [S=backend] (I §18.5)
	docker compose exec $(S) sh

setup: ## One-time local environment: .env and the compose override (§13.2)
	@if [ ! -f .env ]; then cp .env.example .env && echo "setup: created .env from .env.example"; \
	else echo "setup: .env already exists — left untouched"; fi
	@if [ ! -f docker-compose.override.yml ]; then \
		cp docker-compose.override.example.yml docker-compose.override.yml && \
		echo "setup: created docker-compose.override.yml from the example"; \
	else echo "setup: docker-compose.override.yml already exists — left untouched"; fi

migrate: ## Apply database migrations (I §18.7)
	@docker compose exec -T $(S) python manage.py migrate

superuser: ## Create an admin user (I §18.7 reset-admin covers the target state)
	docker compose exec $(S) python manage.py createsuperuser

lint-terraform: ## Terraform formatting — mirrors the CI job lint-terraform (§2.6)
	@command -v terraform >/dev/null || { echo "ERROR: terraform not installed (I §18.2)"; exit 2; }
	@if files=$$(find $(TERRAFORM) -name '*.tf' 2>/dev/null); [ -z "$$files" ]; then \
		echo "lint-terraform: 0 .tf files under $(TERRAFORM) — nothing was checked."; \
		echo "  This gate becomes meaningful in §20 Phase 7; no Terraform exists yet."; \
	else \
		terraform fmt -check -recursive $(TERRAFORM) && echo "lint-terraform: OK ($$(find $(TERRAFORM) -name '*.tf' | wc -l | tr -d ' ') files)"; \
	fi

validate-terraform: ## Terraform validate — mirrors the CI job validate-terraform (§2.6)
	@command -v terraform >/dev/null || { echo "ERROR: terraform not installed (I §18.2)"; exit 2; }
	@dirs=$$(find $(TERRAFORM) -name '*.tf' -exec dirname {} \; 2>/dev/null | sort -u); \
	if [ -z "$$dirs" ]; then \
		echo "validate-terraform: 0 configurations under $(TERRAFORM) — nothing was validated."; \
		echo "  This gate becomes meaningful in §20 Phase 7; no Terraform exists yet."; \
		exit 0; \
	fi; \
	for d in $$dirs; do \
		echo "validate: $$d"; \
		( cd "$$d" && terraform init -backend=false -input=false -no-color >/dev/null && terraform validate -no-color ) || exit 1; \
	done
