<div align="center">
# 👟 SneakIn — E-Commerce Platform
**A modern full-stack e-commerce application for sneaker enthusiasts**
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![Django](https://img.shields.io/badge/Django-6.0-092E20?logo=django&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)
</div>
---
## 📋 Table of Contents
- [About](#about)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Overview](#api-overview)
- [Screenshots](#screenshots)
- [License](#license)
---
## About
SneakIn is a feature-rich e-commerce platform built with a Django REST Framework backend and a React + Vite frontend. It includes a customer-facing storefront with product browsing, cart management, and order placement, as well as a full admin dashboard for managing products, orders, and users.
---
## Features
### 🛍️ Customer Features
- **Product Browsing** — Browse collections with search, filter, and sort
- **Product Details** — Detailed product pages with related product suggestions
- **Shopping Cart** — Add/remove items, view cart totals
- **Order Placement** — Complete checkout with delivery information
- **Order Tracking** — View order history and status
- **User Authentication** — Register, login, and profile management
- **Responsive Design** — Fully responsive across all devices
### 🔧 Admin Dashboard
- **Dashboard Overview** — Sales analytics with interactive charts
- **Product Management** — CRUD operations for products
- **Order Management** — View and update order statuses
- **User Management** — Monitor and manage user accounts
- **Protected Routes** — Admin-only access with role-based auth
---
## Tech Stack
### Backend
| Technology | Purpose |
|---|---|
| Django 6.0 | Web framework |
| Django REST Framework | API layer |
| SimpleJWT | JWT authentication |
| PostgreSQL | Primary database |
| Redis | Caching |
| Docker | Containerization |
| Gunicorn | WSGI server (production) |
### Frontend
| Technology | Purpose |
|---|---|
| React 19 | UI library |
| Vite 7 | Build tool & dev server |
| TailwindCSS 4 | Utility-first CSS |
| React Router 7 | Client-side routing |
| Axios | HTTP client |
| Formik + Yup | Form handling & validation |
| Chart.js / Recharts | Admin dashboard charts |
| React Toastify | Toast notifications |
---
## Project Structure
```
E-Commerce App/
├── backend/                    # Django Backend
│   ├── apps/
│   │   └── accounts/           # User accounts app
│   ├── config/
│   │   ├── settings/
│   │   │   ├── base.py         # Shared settings
│   │   │   ├── dev.py          # Development settings
│   │   │   └── prod.py         # Production settings
│   │   ├── urls.py
│   │   ├── wsgi.py
│   │   └── asgi.py
│   ├── Dockerfile
│   ├── manage.py
│   └── requirements.txt
│
├── e-commerce-app/             # React Frontend
│   ├── src/
│   │   ├── admin/              # Admin module
│   │   │   ├── pages/
│   │   │   │   ├── Dashboard.jsx
│   │   │   │   ├── ProductsManagement.jsx
│   │   │   │   ├── OrdersManagement.jsx
│   │   │   │   └── UsersManagement.jsx
│   │   │   ├── AdminLayout.jsx
│   │   │   ├── AdminProtected.jsx
│   │   │   └── AdminRoutes.jsx
│   │   ├── components/         # Reusable components
│   │   │   ├── Navbar.jsx
│   │   │   ├── Hero.jsx
│   │   │   ├── Footer.jsx
│   │   │   ├── ProductItem.jsx
│   │   │   └── ... (9 more)
│   │   ├── context/            # React Context providers
│   │   │   ├── AuthContext.jsx
│   │   │   └── ShopContext.jsx
│   │   ├── pages/              # Page components
│   │   │   ├── Home.jsx
│   │   │   ├── Collection.jsx
│   │   │   ├── Product.jsx
│   │   │   ├── Cart.jsx
│   │   │   ├── Orders.jsx
│   │   │   └── ... (5 more)
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
│
├── docker-compose.yml          # Docker orchestration
├── .env.example                # Environment template
├── .gitignore
├── .editorconfig
├── LICENSE
└── README.md
```
---
## Prerequisites
- **Python** 3.12+
- **Node.js** 18+
- **PostgreSQL** 16+
- **Redis** 7+
- **Docker & Docker Compose** (optional, for containerized setup)
---
## Getting Started
### 🐳 Option A: Docker (Recommended)
```bash
# 1. Clone the repository
git clone https://github.com/your-username/sneakin.git
cd sneakin
# 2. Copy environment file
cp .env.example .env
# Edit .env with your values
# 3. Start all services
docker-compose up --build
# 4. In a new terminal, start the frontend
cd e-commerce-app
npm install
npm run dev
```
- **Backend API**: http://localhost:8000
- **Frontend**: http://localhost:5173
- **Database**: PostgreSQL on port 5432
- **Redis**: port 6379
### 🔧 Option B: Manual Setup
#### Backend
```bash
# 1. Navigate to backend
cd backend
# 2. Create and activate virtual environment
python -m venv venv
source venv/bin/activate  # macOS/Linux
# venv\Scripts\activate   # Windows
# 3. Install dependencies
pip install -r requirements.txt
# 4. Set up environment
cp ../.env.example ../.env
# Edit ../.env with your values
# 5. Run migrations
python manage.py migrate
# 6. Create superuser
python manage.py createsuperuser
# 7. Start development server
python manage.py runserver
```
#### Frontend
```bash
# 1. Navigate to frontend
cd e-commerce-app
# 2. Install dependencies
npm install
# 3. Start JSON server (mock data)
cd src/data && npx json-server db.json --port 3000 &
cd ../..
# 4. Start development server
npm run dev
```
---
## Environment Variables
| Variable | Description | Default |
|---|---|---|
| `SECRET_KEY` | Django secret key | — (required) |
| `DJANGO_SETTINGS_MODULE` | Settings module path | `config.settings.dev` |
| `DB_NAME` | PostgreSQL database name | `sneakin_db` |
| `DB_USER` | Database username | `postgres` |
| `DB_PASSWORD` | Database password | — (required) |
| `DB_HOST` | Database host | `db` |
| `DB_PORT` | Database port | `5432` |
| `ALLOWED_HOSTS` | Comma-separated hosts | `localhost,127.0.0.1` |
| `CORS_ORIGINS` | Allowed CORS origins | `http://localhost:5173` |
---
## API Overview

### 📖 Interactive API Docs
- **Swagger UI**: `http://localhost/api/docs/`
- **Redoc**: `http://localhost/api/docs/redoc/`

### Customer-Facing Endpoints
| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/register/` | POST | None | User registration |
| `/api/auth/login/` | POST | None | JWT login (returns access + refresh) |
| `/api/auth/token/refresh/` | POST | None | Refresh access token |
| `/api/auth/logout/` | POST | JWT | Blacklist refresh token |
| `/api/auth/profile/` | GET, PUT | JWT | View/update user profile |
| `/api/products/` | GET | None | List products (paginated) |
| `/api/products/<id>/` | GET | None | Product details |
| `/api/cart/` | GET, POST | JWT | View/add to cart |
| `/api/cart/<id>/` | PATCH, DELETE | JWT | Update/remove cart item |
| `/api/orders/` | GET | JWT | List user's orders |
| `/api/orders/place/` | POST | JWT | Place a new order |
| `/api/orders/<id>/cancel/` | PATCH | JWT | Cancel an order |
| `/api/wishlist/` | GET, POST | JWT | View/add to wishlist |

### Admin Endpoints (Require `admin` role)
| Endpoint | Method | Description |
|---|---|---|
| `/api/admin/dashboard/` | GET | Dashboard stats (users, orders, revenue) |
| `/api/admin/users/` | GET | List users (paginated, `?search=&role=`) |
| `/api/admin/users/<id>/` | GET, PATCH, DELETE | User detail / update / deactivate |
| `/api/admin/users/<id>/block/` | PATCH | Toggle block/unblock user |
| `/api/admin/products/` | GET, POST | List (paginated) / create products |
| `/api/admin/products/<id>/` | GET, PATCH, DELETE | Product detail / update / delete |
| `/api/admin/orders/` | GET | List orders (paginated, `?status=&search=`) |
| `/api/admin/orders/<id>/` | GET, PATCH | Order detail / status update |
| `/api/admin/notifications/` | GET | List notifications (`?is_read=&type=`) |
| `/api/admin/notifications/<id>/read/` | PATCH | Mark notification as read |
| `/api/admin/notifications/read-all/` | PATCH | Mark all as read |
| `/api/admin/notifications/unread-count/` | GET | Unread count |

### Infrastructure Endpoints
| Endpoint | Method | Description |
|---|---|---|
| `/api/health/` | GET | Service health check (DB + Redis) |
| `/api/docs/` | GET | Swagger UI (API documentation) |
| `/api/docs/redoc/` | GET | Redoc (API documentation) |
---
## Screenshots
> 📸 *Add screenshots of your application here*
>
> ```
> Place screenshots in a /docs/screenshots/ directory and reference them:
> ![Home Page](docs/screenshots/home.png)
> ![Admin Dashboard](docs/screenshots/admin-dashboard.png)
> ```
---
## License
This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
---
<div align="center">
**Built with ❤️ by the SneakIn Team**
</div>