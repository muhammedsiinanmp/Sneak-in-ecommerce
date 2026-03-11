import pytest
from rest_framework import status


@pytest.mark.django_db
class TestAdminDashboardAPIView:
    """Tests for GET /api/admin/dashboard/"""

    def test_admin_can_access_dashboard(self, admin_client, sample_order):
        response = admin_client.get('/api/admin/dashboard/')
        assert response.status_code == status.HTTP_200_OK
        assert 'total_users' in response.data
        assert 'total_orders' in response.data
        assert 'total_revenue' in response.data

    def test_regular_user_cannot_access(self, user_client):
        response = user_client.get('/api/admin/dashboard/')
        assert response.status_code == status.HTTP_403_FORBIDDEN

    def test_unauthenticated_cannot_access(self, unauthenticated_client):
        response = unauthenticated_client.get('/api/admin/dashboard/')
        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestAdminUserListAPIView:
    """Tests for GET /api/admin/users/"""

    def test_admin_can_list_users(self, admin_client, regular_user):
        response = admin_client.get('/api/admin/users/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 2

    def test_search_users(self, admin_client, regular_user):
        response = admin_client.get('/api/admin/users/?search=Regular')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_regular_user_forbidden(self, user_client):
        response = user_client.get('/api/admin/users/')
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAdminUserDetailAPIView:
    """Tests for /api/admin/users/<id>/"""

    def test_admin_can_view_user(self, admin_client, regular_user):
        response = admin_client.get(f'/api/admin/users/{regular_user.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['email'] == regular_user.email

    def test_admin_can_update_user(self, admin_client, regular_user):
        response = admin_client.patch(
            f'/api/admin/users/{regular_user.id}/',
            {'role': 'admin'}, format='json'
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['role'] == 'admin'

    def test_admin_can_deactivate_user(self, admin_client, regular_user):
        response = admin_client.delete(f'/api/admin/users/{regular_user.id}/')
        assert response.status_code == status.HTTP_200_OK
        regular_user.refresh_from_db()
        assert regular_user.is_active is False

    def test_nonexistent_user_returns_404(self, admin_client):
        response = admin_client.get('/api/admin/users/99999/')
        assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.django_db
class TestAdminUserBlockAPIView:
    """Tests for PATCH /api/admin/users/<id>/block/"""

    def test_admin_can_block_user(self, admin_client, regular_user):
        response = admin_client.patch(f'/api/admin/users/{regular_user.id}/block/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_active'] is False

    def test_admin_can_unblock_user(self, admin_client, regular_user):
        regular_user.is_active = False
        regular_user.save()
        response = admin_client.patch(f'/api/admin/users/{regular_user.id}/block/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['is_active'] is True