from django.db import transaction
from rest_framework import viewsets, generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from apps.cart.models import Cart
from .models import Order, OrderItem
from .serializers import OrderSerializer, PlaceOrderSerializer


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items")

    @action(detail=True, methods=["patch"])
    def cancel(self, request, pk=None):
        order = self.get_object()
        if order.status not in ["pending", "confirmed"]:
            return Response(
                {"error": "Cannot cancel this order"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = "cancelled"
        order.save()

        # Restore stock
        for item in order.items.all():
            if item.product:
                item.product.stock += item.quantity
                item.product.in_stock = True
                item.product.save()

        # Notify admin
        from apps.notifications.utils import send_admin_notification

        send_admin_notification(
            title="Order Cancelled",
            message=f"Order #{order.id} cancelled by {request.user.email}.",
            notification_type="order_cancelled",
        )

        return Response({"status": "Order cancelled"})


class PlaceOrderView(generics.CreateAPIView):
    serializer_class = PlaceOrderSerializer
    permission_classes = [IsAuthenticated]

    @transaction.atomic
    def create(self, request, *args, **kwargs):
        try:
            cart = Cart.objects.prefetch_related("items__product").get(
                user=request.user
            )
        except Cart.DoesNotExist:
            return Response(
                {"error": "Cart not found"}, status=status.HTTP_404_NOT_FOUND
            )

        if not cart.items.exists():
            return Response(
                {"error": "Cart is empty"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Validate stock
        for item in cart.items.all():
            if not item.product.in_stock or item.product.stock < item.quantity:
                return Response(
                    {"error": f"{item.product.name} is out of stock"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        total = sum(i.product.price * i.quantity for i in cart.items.all())
        import json
        order = Order.objects.create(
            user=request.user,
            payment_method=serializer.validated_data["payment_method"],
            shipping_address=json.dumps(serializer.validated_data["shipping_address"]),
            total_amount=total,
        )

        for item in cart.items.select_related("product").all():
            first_img = item.product.images.first()
            OrderItem.objects.create(
                order=order,
                product=item.product,
                product_name=item.product.name,
                product_image=first_img.image_url if first_img else "",
                size=item.size,
                quantity=item.quantity,
                price=item.product.price,
            )
            item.product.stock -= item.quantity
            if item.product.stock <= 0:
                item.product.in_stock = False
            item.product.save()

        cart.items.all().delete()

        # Notify admin
        from apps.notifications.utils import send_admin_notification

        send_admin_notification(
            title="New Order Placed",
            message=f"Order #{order.id} by {request.user.email}. Total: ₹{order.total_amount}",
            notification_type="new_order",
        )

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)
