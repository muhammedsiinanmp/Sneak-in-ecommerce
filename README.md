# SneakIn

A full-stack sneaker e-commerce platform built with Django REST Framework and React.

[![CI](https://github.com/muhammedsiinanmp/Sneak-in-ecommerce/actions/workflows/ci.yml/badge.svg)](https://github.com/muhammedsiinanmp/Sneak-in-ecommerce/actions/workflows/ci.yml)

> **Live demo status:** the hosted backend is currently offline, so the deployed frontend cannot load data. Run the app locally with Docker (see [Running locally](#running-locally)).

---

## What it is

SneakIn lets customers browse a sneaker catalog, manage a cart and wishlist, place orders, and track order status. Admins get a dashboard to manage inventory, handle orders, and receive automated daily sales reports.

---

## Screenshots

Captured from a local run (Django dev server + Vite) with the product catalog seeded by `seed_products`.

| Home | Collection | Product |
|------|------------|---------|
| ![Home page](docs/screenshots/home.jpg) | ![Collection page with filters and pagination](docs/screenshots/collection.jpg) | ![Product detail page with sizes and related products](docs/screenshots/product.jpg) |

---

## Architecture

```mermaid
flowchart LR
    client[React + Vite frontend] --> nginx[Nginx]
    nginx --> api[Django REST API on Gunicorn]
    api --> db[(PostgreSQL)]
    api --> redis[(Redis)]
    beat[Celery Beat] --> redis
    redis --> worker[Celery worker]
    worker --> db
    flower[Flower] --> redis
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Backend | Django 5.1 + Django REST Framework |
| Frontend | React 19 + Vite + TailwindCSS |
| Database | PostgreSQL 16 (Docker container in development and production) |
| Cache / Queue | Redis 7 |
| Background tasks | Celery + Celery Beat |
| Auth | JWT via SimpleJWT (token rotation + blacklisting) |
| Containerization | Docker + Docker Compose |
| Hosting | AWS EC2 + Vercel |
| CI/CD | GitHub Actions |

---

## Features

**Customer**
- Browse products with filtering by brand, category, price
- Persistent cart and wishlist across sessions
- Order placement with price snapshot (price locked at purchase time)
- Payment: cash on delivery only. Stripe and Razorpay appear as `payment_method` choices on the `Order` model and in the checkout UI, but there is no payment-gateway integration: every order is created with status `pending` and no payment is collected
- Order history and status tracking
- JWT authentication with silent token refresh

**Admin**
- Product, inventory, and brand management
- Order status management (confirm, ship, deliver, cancel)
- User management and role control
- Daily sales report auto-generated and emailed at 12:30 AM via Celery Beat

---

## Running locally

**Prerequisites:** Docker Desktop, Git, Node.js 20+
```bash
# Clone
git clone https://github.com/muhammedsiinanmp/Sneak-in-ecommerce.git
cd Sneak-in-ecommerce

# Environment
cp .env.example .env

# Create dev override file
cp docker-compose.override.example.yml docker-compose.override.yml

# Start everything
docker compose up --build

# In a new terminal — run migrations, load the bundled catalog, create an admin
docker compose exec backend python manage.py migrate
docker compose exec backend python manage.py seed_products   # 20 products from backend/apps/products/fixtures/products.json
docker compose exec backend python manage.py createsuperuser
```

`seed_products` is idempotent (re-running does not duplicate products) and accepts `--file <path>` for a different JSON catalog. As an alternative to `createsuperuser`, `python manage.py seed_admin` creates an admin from `ADMIN_EMAIL`, `ADMIN_NAME` and `ADMIN_PASSWORD` in `.env`.

Docker Compose runs the backend services only. Run the frontend separately (it reads `VITE_API_URL` from `e-commerce-app/.env.development`, which points at `http://localhost:8000/api`):
```bash
cd e-commerce-app
npm install
npm run dev     # http://localhost:5173
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| API (public product list) | http://localhost:8000/api/products/ |
| API Docs (Swagger) | http://localhost:8000/api/docs/ |
| Admin panel | http://localhost:8000/admin/ |
| Celery monitor | http://localhost:5555 |

---

## Project structure
```
Sneak-in-ecommerce/
├── backend/
│   ├── apps/
│   │   ├── accounts/        # Auth, user profiles
│   │   ├── products/        # Catalog, brands, categories, sizes
│   │   ├── cart/            # Shopping cart
│   │   ├── orders/          # Order placement and tracking
│   │   ├── wishlist/        # Saved products
│   │   └── notifications/   # In-app alerts
│   ├── config/
│   │   └── settings/        # base.py / dev.py / prod.py
│   └── Dockerfile
├── e-commerce-app/          # React + Vite frontend
├── nginx/                   # Container Nginx config
├── docker-compose.yml       # Base config
├── docker-compose.prod.yml  # Production overrides
└── docker-compose.override.example.yml  # Dev template
```

---

## API reference

Full interactive docs at `/api/docs/`. Endpoints require a JWT by default; products, brands, categories, subcategories, register, login/refresh, health and the schema/docs are public. Key endpoints:
```
POST   /api/auth/register/            Register
POST   /api/auth/login/               Login → JWT tokens
POST   /api/auth/token/refresh/       Refresh access token

GET    /api/products/                 List products (filterable)
GET    /api/products/{id}/            Product detail

GET    /api/cart/                     View cart
POST   /api/cart/add/                 Add item
DELETE /api/cart/item/{id}/remove/    Remove item

POST   /api/orders/place/             Place order
GET    /api/orders/                   Order history

GET    /api/health/                   Service health check
```

---

## Running tests

The backend image installs production dependencies only (`requirements/base.txt`), so run the tests from a virtualenv the way CI does. They need a reachable PostgreSQL. With the dev override, the Compose `db` service is exposed on `localhost:5432`.
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
DB_HOST=localhost python -m pytest

# Coverage excluding migrations and test files
coverage report --omit='*/migrations/*,*/tests/*,*/tests.py'
```

Last measured: **71 tests passing, 89% line coverage** of `backend/apps` (migrations and test files excluded). That was measured with the same `pytest` and `coverage report` commands, with the database settings passed as environment variables, against a local PostgreSQL and with no Redis running.

---

## Deployment

Production runs on AWS EC2 with Docker Compose, and PostgreSQL runs as a container on the same host (`docker-compose.yml` `db` service; the CD workflow backs it up from the `sneak-in-ecommerce-db-1` container before each deploy). The hosted instance is currently offline. Deployment is automated via GitHub Actions — push to `main` and the CD pipeline SSHs into EC2, pulls the latest code, rebuilds containers, runs migrations, and health-checks the API.
```bash
# Manual deploy (if needed)
ssh -i your-key.pem ubuntu@<your-ec2-host>
cd ~/Sneak-in-ecommerce
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Environment variables

Copy `.env.example` and fill in values. Key variables:
```bash
SECRET_KEY=
DJANGO_SETTINGS_MODULE=config.settings.dev

DB_NAME=sneakin_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=db

CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
```

---

## Roadmap

A plan to split the monolith into four services (`identity`, `catalog`, `commerce`, `workers`)
on a Terraform-managed platform is written up in
[docs/migration/README.md](docs/migration/README.md), with decision records in
[docs/adr/](docs/adr/README.md). It is at Phase 0 (structure only): no service code exists yet,
and everything above describes the app as it runs today.

---

## License

[MIT](License)