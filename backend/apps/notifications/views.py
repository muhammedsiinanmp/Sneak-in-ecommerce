from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.db.models import Q

from apps.accounts.permissions import IsAdminUser
from .models import Notification
from .serializers import NotificationSerializer


class AdminNotificationListAPIView(APIView):
    """
    GET /api/admin/notifications/
    List all notifications for admin users.
    Query params: ?is_read=false&type=new_order
    """
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        queryset = Notification.objects.filter(
            Q(recipient__isnull=True) | Q(recipient=request.user)
        ).order_by('-created_at')

        # Filter by read status
        is_read = request.query_params.get('is_read', None)
        if is_read is not None:
            queryset = queryset.filter(is_read=is_read.lower() == 'true')

        # Filter by type
        notif_type = request.query_params.get('type', None)
        if notif_type:
            queryset = queryset.filter(notification_type=notif_type)

        # Limit results
        limit = int(request.query_params.get('limit', 50))
        queryset = queryset[:limit]

        serializer = NotificationSerializer(queryset, many=True)
        return Response(serializer.data)


class AdminNotificationMarkReadAPIView(APIView):
    """
    PATCH /api/admin/notifications/<id>/read/
    Mark one notification as read.
    """
    permission_classes = [IsAuthenticated, IsAdminUser]

    def patch(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk)
        except Notification.DoesNotExist:
            return Response({'error': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)

        notification.is_read = True
        notification.save()
        return Response(NotificationSerializer(notification).data)


class AdminNotificationMarkAllReadAPIView(APIView):
    """
    PATCH /api/admin/notifications/read-all/
    Mark all notifications as read.
    """
    permission_classes = [IsAuthenticated, IsAdminUser]

    def patch(self, request):
        updated = Notification.objects.filter(
            Q(recipient__isnull=True) | Q(recipient=request.user),
            is_read=False
        ).update(is_read=True)

        return Response({'detail': f'{updated} notifications marked as read.'})


class AdminNotificationUnreadCountAPIView(APIView):
    """
    GET /api/admin/notifications/unread-count/
    Returns the count of unread notifications.
    """
    permission_classes = [IsAuthenticated, IsAdminUser]

    def get(self, request):
        count = Notification.objects.filter(
            Q(recipient__isnull=True) | Q(recipient=request.user),
            is_read=False
        ).count()

        return Response({'unread_count': count})