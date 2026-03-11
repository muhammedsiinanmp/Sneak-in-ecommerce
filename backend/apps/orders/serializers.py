import json
from rest_framework import serializers
from .models import Order, OrderItem


class OrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderItem
        fields = [
            "id",
            "product",
            "product_name",
            "product_image",
            "size",
            "quantity",
            "price",
            "cancelled",
        ]


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)
    shipping_address = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            "id",
            "user",
            "status",
            "payment_method",
            "total_amount",
            "shipping_address",
            "created_at",
            "items",
        ]
        read_only_fields = ["id", "user", "status", "total_amount", "created_at"]

    def get_shipping_address(self, obj):
        try:
            return json.loads(obj.shipping_address)
        except (ValueError, TypeError, json.JSONDecodeError):
            return obj.shipping_address


class PlaceOrderSerializer(serializers.Serializer):
    payment_method = serializers.ChoiceField(choices=Order.PAYMENT_CHOICES)
    shipping_address = serializers.JSONField(required=True)
