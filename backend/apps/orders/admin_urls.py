from django.urls import path
from .admin_views import AdminOrderListAPIView, AdminOrderDetailAPIView

urlpatterns = [
    path('orders/', AdminOrderListAPIView.as_view(), name='admin-order-list'),
    path('orders/<int:pk>/', AdminOrderDetailAPIView.as_view(), name='admin-order-detail'),
]