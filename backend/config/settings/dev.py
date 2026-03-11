from .base import *
from decouple import config

DEBUG = True
ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="sneakin_db"),
        "USER": config("DB_USER", default="postgres"),
        "PASSWORD": config("DB_PASSWORD", default="postgres"),
        "HOST": config("DB_HOST", default="db"),
        "PORT": config("DB_PORT", default="5432"),
    }
}

CORS_ALLOW_ALL_ORIGINS = True

# Dev email — prints to console
EMAIL_BACKEND = "django.core.mail.backends.console.EmailBackend"
