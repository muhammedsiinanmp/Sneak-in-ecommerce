from django.urls import path
from .admin_views import (
    AdminDashboardAPIView,
    AdminUserListAPIView,
    AdminUserDetailAPIView,
    AdminUserBlockAPIView,
)

urlpatterns = [
    path("dashboard/", AdminDashboardAPIView.as_view(), name="admin-dashboard"),
    path("users/", AdminUserListAPIView.as_view(), name="admin-user-list"),
    path("users/<int:pk>/", AdminUserDetailAPIView.as_view(), name="admin-user-detail"),
    path(
        "users/<int:pk>/block/",
        AdminUserBlockAPIView.as_view(),
        name="admin-user-block",
    ),
]
