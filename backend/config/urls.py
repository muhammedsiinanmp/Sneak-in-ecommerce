from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),

    # Customer-facing APIs
    path('api/auth/', include('apps.accounts.urls')),
    path('api/', include('apps.products.urls')),
    path('api/cart/', include('apps.cart.urls')),
    path('api/orders/', include('apps.orders.urls')),
    path('api/wishlist/', include('apps.wishlist.urls')),

    # Admin APIs
    path('api/admin/', include('apps.accounts.admin_urls')),
    path('api/admin/', include('apps.products.admin_urls')),
    path('api/admin/', include('apps.orders.admin_urls')),
    path('api/admin/notifications/', include('apps.notifications.urls')),

] 

if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)