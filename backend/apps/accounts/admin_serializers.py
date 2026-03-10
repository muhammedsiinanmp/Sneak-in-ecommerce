from rest_framework import serializers
from django.contrib.auth import get_user_model


User = get_user_model()

class AdminUserSerializer(serializers.ModelSerializer):
    orders_count = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id','email','name','phone','address',
            'role','is_active','is_staff','created_at','orders_count'
        ]
        read_only_fields = ['id', 'email', 'created_at']

    def get_orders_count(self,obj):
        return obj.orders.count() if hasattr(obj,'orders') else 0


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['name', 'phone', 'address', 'role', 'is_active']