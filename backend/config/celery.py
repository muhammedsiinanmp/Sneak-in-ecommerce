import os
from celery import Celery

# Set the default Django settings module
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')

# Create the Celery app
app = Celery('sneakin')

# Load config from Django settings, using the CELERY_ namespace
app.config_from_object('django.conf:settings', namespace='CELERY')

# Auto-discover tasks.py in all installed apps
app.autodiscover_tasks()


@app.task(bind=True, ignore_result=True)
def debug_task(self):
    """A debug task to verify Celery is working."""
    print(f'Request: {self.request!r}')
