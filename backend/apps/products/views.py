from rest_framework import viewsets, generics
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from .models import Product, Brand, Category, SubCategory
from .serializers import (
    ProductListSerializer, ProductDetailSerializer,
    BrandSerializer, CategorySerializer, SubCategorySerializer,
)
from .filters import ProductFilter

from django_filters.rest_framework import DjangoFilterBackend
from rest_framework.filters import SearchFilter, OrderingFilter


class ProductViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Product.objects.select_related('brand','category','subcategory')\
                .prefetch_related('images','sizes').all()
    permission_classes = [AllowAny]
    filterset_class = ProductFilter

    filter_backends = [DjangoFilterBackend, SearchFilter, OrderingFilter]
    
    search_fields = ['name','brand__name','description']
    ordering_fields = ['price','created_at','name']
    ordering = ['-created_at']

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return ProductDetailSerializer
        return ProductListSerializer

    @action(detail=False,methods=['get'])
    def bestsellers(self,request):
        qs = self.queryset.filter(bestseller=True)[:10]
        serializer = ProductListSerializer(qs,many=True)
        return Response(serializer.data)

class BrandListView(generics.ListAPIView):
    queryset = Brand.objects.all()
    serializer_class = BrandSerializer
    permission_classes = [AllowAny]
    pagination_class = None
class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [AllowAny]
    pagination_class = None
class SubCategoryListView(generics.ListAPIView):
    queryset = SubCategory.objects.all()
    serializer_class = SubCategorySerializer
    permission_classes = [AllowAny]
    pagination_class = None
