from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import ProductViewSet, BrandListView, CategoryListView, SubCategoryListView

router = DefaultRouter()
router.register("products", ProductViewSet)

urlpatterns = [
    path("", include(router.urls)),
    path("brands/", BrandListView.as_view(), name="brand-list"),
    path("categories/", CategoryListView.as_view(), name="category-list"),
    path("subcategories/", SubCategoryListView.as_view(), name="subcategory-list"),
]
