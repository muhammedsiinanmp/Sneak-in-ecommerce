from rest_framework import serializers
from .models import Brand, Category, SubCategory, Product, ProductImage, ProductSize


class BrandSerializer(serializers.ModelSerializer):
    class Meta:
        model = Brand
        fields = "__all__"


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"


class SubCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SubCategory
        fields = "__all__"


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ["id", "image_url", "display_order"]


class ProductSizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductSize
        fields = ["id", "size_value", "stock"]


class ProductListSerializer(serializers.ModelSerializer):
    """Lightweight - used for listing/collection page"""

    brand = serializers.StringRelatedField()
    category = serializers.StringRelatedField()
    subcategory = serializers.StringRelatedField()
    image = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            "id",
            "name",
            "brand",
            "category",
            "subcategory",
            "price",
            "mrp",
            "in_stock",
            "bestseller",
            "image",
        ]

    def get_image(self,obj):
        first_img = obj.images.first()
        return first_img.image_url if first_img else None
    
class ProductDetailSerializer(serializers.ModelSerializer):
    """Full detail — used for product page"""
    brand = BrandSerializer()
    category = CategorySerializer()
    subcategory = SubCategorySerializer()
    images = ProductImageSerializer(many=True, read_only=True)
    sizes = ProductSizeSerializer(many=True, read_only=True)
    class Meta:
        model = Product
        fields = '__all__'
