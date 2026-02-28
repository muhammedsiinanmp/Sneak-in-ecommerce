import django_filters
from .models import Product


class ProductFilter(django_filters.FilterSet):
    min_price = django_filters.NumberFilter(field_name='price',lookup_expr='gte')
    max_price = django_filters.NumberFilter(field_name='price',lookup_expr='lte')
    brand = django_filters.CharFilter(field_name='brand__name',lookup_expr='icontains')
    category = django_filters.CharFilter(field_name='category__name', lookup_expr='icontains')
    subcategory = django_filters.CharFilter(field_name='subcategory__name', lookup_expr='icontains')

    class Meta:
        model = Product
        fields = ['in_stock', 'bestseller', 'brand', 'category', 'subcategory']
