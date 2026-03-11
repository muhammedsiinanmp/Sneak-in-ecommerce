import pytest
from rest_framework import status
from apps.notifications.models import Notification


@pytest.mark.django_db
class TestAdminNotificationListAPIView:
    """Tests for GET /api/admin/notifications/"""

    def test_admin_can_list_notifications(self, admin_client):
        Notification.objects.create(
            title="Test", message="test", notification_type="system"
        )
        response = admin_client.get("/api/admin/notifications/")
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_regular_user_forbidden(self, user_client):
        response = user_client.get("/api/admin/notifications/")
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAdminNotificationMarkReadAPIView:
    """Tests for PATCH /api/admin/notifications/<id>/read/"""

    def test_mark_as_read(self, admin_client):
        n = Notification.objects.create(title="Test", message="test", is_read=False)
        response = admin_client.patch(f"/api/admin/notifications/{n.id}/read/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["is_read"] is True


@pytest.mark.django_db
class TestAdminNotificationUnreadCountAPIView:
    """Tests for GET /api/admin/notifications/unread-count/"""

    def test_unread_count(self, admin_client):
        Notification.objects.create(title="N1", message="test", is_read=False)
        Notification.objects.create(title="N2", message="test", is_read=True)
        response = admin_client.get("/api/admin/notifications/unread-count/")
        assert response.status_code == status.HTTP_200_OK
        assert response.data["unread_count"] == 1
