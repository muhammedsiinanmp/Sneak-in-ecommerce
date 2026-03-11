from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from apps.accounts.health_views import HealthCheckAPIView
from drf_spectacular.views import (
    SpectacularAPIView,
    SpectacularSwaggerView,
    SpectacularRedocView,
)

urlpatterns = [
    path("admin/", admin.site.urls),
    # Health Check
    path("api/health/", HealthCheckAPIView.as_view(), name="health-check"),
    # API Documentation (Swagger / Redoc)
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
    path(
        "api/docs/redoc/", SpectacularRedocView.as_view(url_name="schema"), name="redoc"
    ),
    # Customer-facing APIs
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.products.urls")),
    path("api/cart/", include("apps.cart.urls")),
    path("api/orders/", include("apps.orders.urls")),
    path("api/wishlist/", include("apps.wishlist.urls")),
    # Admin APIs
    path("api/admin/", include("apps.accounts.admin_urls")),
    path("api/admin/", include("apps.products.admin_urls")),
    path("api/admin/", include("apps.orders.admin_urls")),
    path("api/admin/notifications/", include("apps.notifications.urls")),
]

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
