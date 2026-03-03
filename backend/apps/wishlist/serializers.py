from rest_framework import serializers
from .models import Wishlist
from apps.products.serializers import ProductListSerializer

class WishlistSerializer(serializers.ModelSerializer):
    product_detail = ProductListSerializer(source='product', read_only=True)
    
    class Meta:
        model = Wishlist
        fields = ['id', 'product', 'product_detail', 'added_at']
        read_only_fields = ['id', 'added_at']
