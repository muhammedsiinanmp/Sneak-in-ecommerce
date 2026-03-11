from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.db.models import Q

from apps.accounts.permissions import IsAdminUser
from .models import Order
from .admin_serializers import AdminOrderSerializer


class AdminPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminOrderListAPIView(APIView):
    """
    GET /api/admin/orders/
    List all orders with search and filter.
    Query params: ?status=pending&search=john@example.com
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        queryset = Order.objects.select_related("user").prefetch_related("items").all()

        order_status = request.query_params.get("status", None)
        if order_status:
            queryset = queryset.filter(status=order_status)

        search = request.query_params.get("search", None)
        if search:
            queryset = queryset.filter(
                Q(user__email__icontains=search) | Q(user__name__icontains=search)
            )

        paginator = AdminPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AdminOrderSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AdminOrderDetailAPIView(APIView):
    """
    GET   /api/admin/orders/<id>/   — View order with items
    PATCH /api/admin/orders/<id>/   — Update order status
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_order(self, pk):
        try:
            return (
                Order.objects.select_related("user")
                .prefetch_related("items")
                .get(pk=pk)
            )
        except Order.DoesNotExist:
            return None

    def get(self, request, pk):
        order = self.get_order(pk)
        if not order:
            return Response(
                {"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND
            )
        return Response(AdminOrderSerializer(order).data)

    def patch(self, request, pk):
        order = self.get_order(pk)
        if not order:
            return Response(
                {"error": "Order not found"}, status=status.HTTP_404_NOT_FOUND
            )

        new_status = request.data.get("status")
        if new_status not in [
            "pending",
            "confirmed",
            "shipped",
            "delivered",
            "cancelled",
        ]:
            return Response(
                {"error": "Invalid status"}, status=status.HTTP_400_BAD_REQUEST
            )

        # If cancelling, restore stock
        if new_status == "cancelled" and order.status != "cancelled":
            for item in order.items.all():
                if item.product and not item.cancelled:
                    item.product.stock += item.quantity
                    item.product.in_stock = True
                    item.product.save()

        order.status = new_status
        order.save()
        return Response(AdminOrderSerializer(order).data)
