from rest_framework import serializers
from .models import Product, ProductImage, ProductSize


class AdminProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'image_url', 'display_order']


class AdminProductSizeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductSize
        fields = ['id', 'size_value', 'stock']


class AdminProductReadSerializer(serializers.ModelSerializer):
    """Read-only serializer with nested brand/category names and images."""
    brand_name = serializers.CharField(source='brand.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    subcategory_name = serializers.CharField(source='subcategory.name', read_only=True)
    images = AdminProductImageSerializer(many=True, read_only=True)
    sizes = AdminProductSizeSerializer(many=True, read_only=True)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'brand', 'brand_name', 'category', 'category_name',
            'subcategory', 'subcategory_name', 'price', 'mrp', 'description',
            'release_date', 'bestseller', 'in_stock', 'stock',
            'created_at', 'images', 'sizes',
        ]


class AdminProductWriteSerializer(serializers.ModelSerializer):
    """Writable serializer for creating/updating products."""
    images = AdminProductImageSerializer(many=True, required=False)
    sizes = AdminProductSizeSerializer(many=True, required=False)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'brand', 'category', 'subcategory',
            'price', 'mrp', 'description', 'release_date',
            'bestseller', 'in_stock', 'stock', 'images', 'sizes',
        ]

    def create(self, validated_data):
        images_data = validated_data.pop('images', [])
        sizes_data = validated_data.pop('sizes', [])
        product = Product.objects.create(**validated_data)
        for image_data in images_data:
            ProductImage.objects.create(product=product, **image_data)
        for size_data in sizes_data:
            ProductSize.objects.create(product=product, **size_data)
        return product

    def update(self, instance, validated_data):
        images_data = validated_data.pop('images', None)
        sizes_data = validated_data.pop('sizes', None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        if images_data is not None:
            instance.images.all().delete()
            for image_data in images_data:
                ProductImage.objects.create(product=instance, **image_data)
        if sizes_data is not None:
            instance.sizes.all().delete()
            for size_data in sizes_data:
                ProductSize.objects.create(product=instance, **size_data)
        return instance