import logging
from datetime import timedelta
from celery import shared_task
from django.utils import timezone
from django.db.models import Sum, Count
from django.core.mail import send_mail
from django.conf import settings
from django.contrib.auth import get_user_model

logger = logging.getLogger(__name__)
User = get_user_model()


@shared_task
def generate_daily_sales_report():
    """
    Generate a daily sales report for the previous day.
    Logs the report and emails admin users.
    Runs via Celery Beat at 12:30 AM daily.
    """
    from apps.orders.models import Order, OrderItem

    yesterday = timezone.now().date() - timedelta(days=1)

    orders_qs = Order.objects.filter(created_at__date=yesterday)

    total_orders = orders_qs.count()
    delivered_orders = orders_qs.filter(status="delivered").count()
    cancelled_orders = orders_qs.filter(status="cancelled").count()
    pending_orders = orders_qs.filter(status="pending").count()

    total_revenue = (
        orders_qs.filter(status="delivered").aggregate(total=Sum("total_amount"))[
            "total"
        ]
        or 0
    )

    total_items_sold = (
        OrderItem.objects.filter(
            order__created_at__date=yesterday,
            order__status="delivered",
            cancelled=False,
        ).aggregate(total=Sum("quantity"))["total"]
        or 0
    )

    # Top 5 selling products
    top_products = list(
        OrderItem.objects.filter(order__created_at__date=yesterday, cancelled=False)
        .values("product_name")
        .annotate(total_sold=Sum("quantity"))
        .order_by("-total_sold")[:5]
    )

    # Log the report
    report = (
        f"\n📊 Daily Sales Report — {yesterday}\n"
        f"{'=' * 40}\n"
        f"Total Orders: {total_orders}\n"
        f"Delivered: {delivered_orders}\n"
        f"Cancelled: {cancelled_orders}\n"
        f"Pending: {pending_orders}\n"
        f"Total Revenue: ₹{total_revenue}\n"
        f"Items Sold: {total_items_sold}\n"
    )

    for i, product in enumerate(top_products, 1):
        report += f"  {i}. {product['product_name']} — {product['total_sold']} sold\n"

    logger.info(report)

    # Email to all admin users
    admin_emails = list(
        User.objects.filter(role="admin", is_active=True).values_list(
            "email", flat=True
        )
    )

    if admin_emails:
        send_mail(
            subject=f"SneakIn Daily Sales Report — {yesterday}",
            message=report,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=admin_emails,
            fail_silently=False,
        )
        logger.info(f"Daily sales report email sent to: {', '.join(admin_emails)}")

    logger.info(f"Daily sales report generated for {yesterday}")
    return f"Report generated for {yesterday}. Revenue: ₹{total_revenue}"
