import logging
from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings

logger = logging.getLogger(__name__)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def send_welcome_email(self, user_email, user_name):
    """
    Send a welcome email to a new user.
    Retries up to 3 times on failure.
    """
    try:
        send_mail(
            subject="Welcome to SneakIn!  👟",
            message=(
                f"Hi {user_name},\n\n"
                f"Welcome to SneakIn! We're thrilled to have you.\n\n"
                f"Start exploring our collection of premium sneakers.\n\n"
                f"Happy Shopping!\n"
                f"— The SneakIn Team"
            ),
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user_email],
            fail_silently=False,
        )
        logger.info(f"Welcome email sent to {user_email}")
        return f"Welcome email sent to {user_email}"
    except Exception as exc:
        logger.error(f"Failed to send welcome email to {user_email}: {exc}")
        raise self.retry(exc=exc)
