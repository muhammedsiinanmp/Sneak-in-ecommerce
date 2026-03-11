from django.urls import path
from .views import (
    AdminNotificationListAPIView,
    AdminNotificationMarkReadAPIView,
    AdminNotificationMarkAllReadAPIView,
    AdminNotificationUnreadCountAPIView,
)

urlpatterns = [
    path("", AdminNotificationListAPIView.as_view(), name="admin-notification-list"),
    path(
        "<int:pk>/read/",
        AdminNotificationMarkReadAPIView.as_view(),
        name="admin-notification-read",
    ),
    path(
        "read-all/",
        AdminNotificationMarkAllReadAPIView.as_view(),
        name="admin-notification-read-all",
    ),
    path(
        "unread-count/",
        AdminNotificationUnreadCountAPIView.as_view(),
        name="admin-notification-unread-count",
    ),
]
