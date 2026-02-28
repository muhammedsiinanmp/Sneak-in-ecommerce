from .base import *
from decouple import config 

DEBUG = False
ALLOWED_HOSTS = config('ALLOWED_HOSTS',default="").split(',')

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': config('DB_NAME'),
        'USER': config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('DB_HOST'),
        'PORT': config('DB_PORT', default='5432'),
    }
}

CORS_ALLOWED_ORIGINS = config('CORS_ORIGINS',default="").split(',')