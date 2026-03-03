from django.contrib import admin
from django.urls import path,include
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/auth/',include('apps.accounts.urls')),
    path('api/',include('apps.products.urls')),
    path('api/cart/',include('apps.cart.urls')),
    path('api/orders/', include('apps.orders.urls')),
    path('api/wishlist/', include('apps.wishlist.urls')),
    
] + static(settings.MEDIA_URL,document_root=settings.MEDIA_ROOT)