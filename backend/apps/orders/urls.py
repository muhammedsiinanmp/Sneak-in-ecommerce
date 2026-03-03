from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import OrderViewSet, PlaceOrderView

router = DefaultRouter()
router.register('', OrderViewSet, basename='order')

urlpatterns = [
    path('place/', PlaceOrderView.as_view(), name='place-order'),
    path('', include(router.urls)),
]
