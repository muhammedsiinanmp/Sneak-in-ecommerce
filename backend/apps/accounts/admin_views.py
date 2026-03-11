from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.pagination import PageNumberPagination
from django.contrib.auth import get_user_model
from django.db.models import Sum, Q
from django.utils import timezone
from datetime import timedelta

from apps.accounts.permissions import IsAdminUser
from apps.orders.models import Order, OrderItem
from apps.products.models import Product
from .admin_serializers import AdminUserSerializer, AdminUserUpdateSerializer

User = get_user_model()


class AdminPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100


class AdminDashboardAPIView(APIView):
    """
    GET /api/admin/dashboard/
    Returns aggregated stats for the admin dashboard.
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        total_users = User.objects.filter(role="user").count()
        total_orders = Order.objects.count()
        pending_orders = Order.objects.filter(status="pending").count()
        delivered_orders = Order.objects.filter(status="delivered").count()
        cancelled_orders = Order.objects.filter(status="cancelled").count()

        total_revenue = (
            Order.objects.filter(status="delivered").aggregate(
                total=Sum("total_amount")
            )["total"]
            or 0
        )

        low_stock_products = Product.objects.filter(stock__lt=10).count()

        # Recent 10 orders
        recent_orders = Order.objects.select_related("user").order_by("-created_at")[
            :10
        ]
        recent_orders_data = [
            {
                "id": order.id,
                "user_email": order.user.email,
                "user_name": order.user.name,
                "total_amount": str(order.total_amount),
                "status": order.status,
                "created_at": order.created_at.isoformat(),
            }
            for order in recent_orders
        ]

        # Top 5 selling products
        top_products = list(
            OrderItem.objects.values("product_name")
            .annotate(total_sold=Sum("quantity"))
            .order_by("-total_sold")[:5]
        )

        return Response(
            {
                "total_users": total_users,
                "total_orders": total_orders,
                "total_revenue": total_revenue,
                "pending_orders": pending_orders,
                "delivered_orders": delivered_orders,
                "cancelled_orders": cancelled_orders,
                "low_stock_products": low_stock_products,
                "recent_orders": recent_orders_data,
                "top_products": top_products,
            }
        )


class AdminUserListAPIView(APIView):
    """
    GET /api/admin/users/
    List all users with search and role filter.
    Query params: ?search=john&role=admin
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        queryset = User.objects.all().order_by("-created_at")

        search = request.query_params.get("search", None)
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) | Q(email__icontains=search)
            )

        role = request.query_params.get("role", None)
        if role in ["admin", "user"]:
            queryset = queryset.filter(role=role)

        paginator = AdminPagination()
        page = paginator.paginate_queryset(queryset, request)
        serializer = AdminUserSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)


class AdminUserDetailAPIView(APIView):
    """
    GET    /api/admin/users/<id>/   — View user details
    PATCH  /api/admin/users/<id>/   — Update user (role, is_active, etc.)
    DELETE /api/admin/users/<id>/   — Deactivate (soft-delete) user
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def get_user(self, pk):
        try:
            return User.objects.get(pk=pk)
        except User.DoesNotExist:
            return None

    def get(self, request, pk):
        user = self.get_user(pk)
        if not user:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = AdminUserSerializer(user)
        return Response(serializer.data)

    def patch(self, request, pk):
        user = self.get_user(pk)
        if not user:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )
        serializer = AdminUserUpdateSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(AdminUserSerializer(user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        user = self.get_user(pk)
        if not user:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )
        user.is_active = False
        user.save()
        return Response({"detail": f"User {user.email} has been deactivated."})


class AdminUserBlockAPIView(APIView):
    """
    PATCH /api/admin/users/<id>/block/
    Toggles user is_active field.
    """

    permission_classes = [IsAuthenticated, IsAdminUser]

    def patch(self, request, pk):
        try:
            user = User.objects.get(pk=pk)
        except User.DoesNotExist:
            return Response(
                {"error": "User not found"}, status=status.HTTP_404_NOT_FOUND
            )

        user.is_active = not user.is_active
        user.save()
        action = "unblocked" if user.is_active else "blocked"
        return Response(
            {
                "detail": f"User {user.email} has been {action}.",
                "is_active": user.is_active,
            }
        )
