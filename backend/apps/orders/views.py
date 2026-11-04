import json
from collections import Counter

from django.db import transaction
from rest_framework import viewsets, generics, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import action
from apps.cart.models import Cart
from apps.products.models import Product
from .models import Order, OrderItem
from .serializers import OrderSerializer, PlaceOrderSerializer


def lock_products(product_ids):
    """Lock the given product rows until the surrounding transaction ends.

    Rows are locked in primary-key order so concurrent requests cannot
    deadlock against each other.
    """
    products = (
        Product.objects.select_for_update().filter(pk__in=product_ids).order_by("pk")
    )
    return {product.pk: product for product in products}


class OrderViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(user=self.request.user).prefetch_related("items")

    @action(detail=True, methods=["patch"])
    @transaction.atomic
    def cancel(self, request, pk=None):
        order = self.get_object()
        # Re-read under a row lock so concurrent cancels cannot both pass the
        # status check and restore stock twice.
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status not in ["pending", "confirmed"]:
            return Response(
                {"error": "Cannot cancel this order"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.status = "cancelled"
        order.save()

        # Restore stock for items that have not already been cancelled
        items = list(order.items.filter(cancelled=False, product__isnull=False))
        products = lock_products({item.product_id for item in items})
        for item in items:
            product = products[item.product_id]
            product.stock += item.quantity
            product.in_stock = True
        for product in products.values():
            product.save()

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

        cart_items = list(cart.items.all())
        if not cart_items:
            return Response(
                {"error": "Cart is empty"}, status=status.HTTP_400_BAD_REQUEST
            )

        # Lock the product rows so concurrent orders cannot oversell, then
        # validate stock against the total quantity requested per product.
        products = lock_products({item.product_id for item in cart_items})
        requested = Counter()
        for item in cart_items:
            requested[item.product_id] += item.quantity
        for product_id, quantity in requested.items():
            product = products[product_id]
            if not product.in_stock or product.stock < quantity:
                return Response(
                    {"error": f"{product.name} is out of stock"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        total = sum(products[i.product_id].price * i.quantity for i in cart_items)
        order = Order.objects.create(
            user=request.user,
            payment_method=serializer.validated_data["payment_method"],
            shipping_address=json.dumps(serializer.validated_data["shipping_address"]),
            total_amount=total,
        )

        for item in cart_items:
            product = products[item.product_id]
            first_img = product.images.first()
            OrderItem.objects.create(
                order=order,
                product=product,
                product_name=product.name,
                product_image=first_img.image_url if first_img else "",
                size=item.size,
                quantity=item.quantity,
                price=product.price,
            )
            product.stock -= item.quantity
            if product.stock <= 0:
                product.in_stock = False
        for product in products.values():
            product.save()

        cart.items.all().delete()

        # Notify admin
        from apps.notifications.utils import send_admin_notification

        send_admin_notification(
            title="New Order Placed",
            message=f"Order #{order.id} by {request.user.email}. Total: ₹{order.total_amount}",
            notification_type="new_order",
        )

        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)
