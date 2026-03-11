# ── Stage 1: Base ──
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Collect static files for Nginx to serve
RUN python manage.py collectstatic --noinput --settings=config.settings.dev 2>/dev/null || true

# Create non-root user for security
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 8000

# Use Gunicorn with config file
CMD ["gunicorn", "config.wsgi:application", "--config", "gunicorn.conf.py"]