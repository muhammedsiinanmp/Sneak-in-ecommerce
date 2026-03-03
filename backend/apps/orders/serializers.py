from rest_framework import serializers
from .models import Order, OrderItem

class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'product_image', 'size', 'quantity', 'price', 'cancelled']

class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    
    class Meta:
        model = Order
        fields = ['id', 'user', 'status', 'payment_method', 'total_amount', 'shipping_address', 'created_at', 'items']
        read_only_fields = ['id', 'user', 'status', 'total_amount', 'created_at']

class PlaceOrderSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_CHOICES)
    shipping_address = serializers.CharField(required=True)
