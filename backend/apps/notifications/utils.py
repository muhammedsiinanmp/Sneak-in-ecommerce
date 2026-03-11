import logging
from .models import Notification

logger = logging.getLogger(__name__)


def send_admin_notification(title, message, notification_type='system', recipient=None):
    """
    Create a Notification record in the database.

    Args:
        title: Notification title
        message: Notification body text
        notification_type: One of Notification.NOTIFICATION_TYPES choices
        recipient: Specific user (or None for broadcast to all admins)

    Usage:
        from apps.notifications.utils import send_admin_notification
        send_admin_notification("New Order", "Order #123 placed", "new_order")
    """
    notification = Notification.objects.create(
        recipient=recipient,
        title=title,
        message=message,
        notification_type=notification_type,
    )

    logger.info(f"Notification created: [{notification_type}] {title}")
    return notification