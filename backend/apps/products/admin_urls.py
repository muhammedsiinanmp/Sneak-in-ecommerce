from django.urls import path
from .admin_views import AdminProductListCreateAPIView, AdminProductDetailAPIView

urlpatterns = [
    path(
        "products/", AdminProductListCreateAPIView.as_view(), name="admin-product-list"
    ),
    path(
        "products/<int:pk>/",
        AdminProductDetailAPIView.as_view(),
        name="admin-product-detail",
    ),
]
