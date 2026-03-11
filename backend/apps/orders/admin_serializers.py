from rest_framework import serializers
from .models import Order, OrderItem


class AdminOrderItemSerializer(serializers.ModelSerializer):
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


class AdminOrderSerializer(serializers.ModelSerializer):
    items = AdminOrderItemSerializer(many=True, read_only=True)
    user_email = serializers.CharField(source="user.email", read_only=True)
    user_name = serializers.CharField(source="user.name", read_only=True)

    class Meta:
        model = Order
        fields = [
            "id",
            "user",
            "user_email",
            "user_name",
            "status",
            "payment_method",
            "total_amount",
            "shipping_address",
            "created_at",
            "items",
        ]
        read_only_fields = ["id", "user", "total_amount", "created_at"]
