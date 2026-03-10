from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q

from apps.accounts.permissions import IsAdminUser
from .models import Product
from .admin_serializers import AdminProductReadSerializer, AdminProductWriteSerializer


class AdminProductListCreateAPIView(APIView):
    """
    GET  /api/admin/products/     — List all products with search/filter
    POST /api/admin/products/     — Create a new product
    """
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        queryset = (
            Product.objects
            .select_related('brand', 'category', 'subcategory')
            .prefetch_related('images', 'sizes')
            .all()
            .order_by('-created_at')
        )

        search = request.query_params.get('search', None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(brand__name__icontains=search)
            )

        brand_id = request.query_params.get('brand', None)
        if brand_id:
            queryset = queryset.filter(brand_id=brand_id)

        category_id = request.query_params.get('category', None)
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        serializer = AdminProductReadSerializer(queryset, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = AdminProductWriteSerializer(data=request.data)
        if serializer.is_valid():
            product = serializer.save()
            return Response(
                AdminProductReadSerializer(product).data,
                status=status.HTTP_201_CREATED
            )
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdminProductDetailAPIView(APIView):
    """
    GET    /api/admin/products/<id>/   — View product
    PATCH  /api/admin/products/<id>/   — Update product
    DELETE /api/admin/products/<id>/   — Delete product
    """
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_product(self, pk):
        try:
            return Product.objects.select_related(
                'brand', 'category', 'subcategory'
            ).prefetch_related('images', 'sizes').get(pk=pk)
        except Product.DoesNotExist:
            return None

    def get(self, request, pk):
        product = self.get_product(pk)
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(AdminProductReadSerializer(product).data)

    def patch(self, request, pk):
        product = self.get_product(pk)
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        serializer = AdminProductWriteSerializer(product, data=request.data, partial=True)
        if serializer.is_valid():
            updated = serializer.save()
            return Response(AdminProductReadSerializer(updated).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        product = self.get_product(pk)
        if not product:
            return Response({'error': 'Product not found'}, status=status.HTTP_404_NOT_FOUND)
        product.delete()
        return Response({'detail': 'Product deleted.'}, status=status.HTTP_204_NO_CONTENT)