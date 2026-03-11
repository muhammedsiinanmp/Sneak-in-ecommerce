import pytest
from rest_framework import status


@pytest.mark.django_db
class TestAdminOrderListAPIView:
    """Tests for GET /api/admin/orders/"""

    def test_admin_can_list_orders(self, admin_client, sample_order):
        response = admin_client.get('/api/admin/orders/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_filter_by_status(self, admin_client, sample_order):
        response = admin_client.get('/api/admin/orders/?status=pending')
        assert response.status_code == status.HTTP_200_OK
        assert all(o['status'] == 'pending' for o in response.data)

    def test_regular_user_forbidden(self, user_client):
        response = user_client.get('/api/admin/orders/')
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAdminOrderDetailAPIView:
    """Tests for /api/admin/orders/<id>/"""

    def test_admin_can_view_order(self, admin_client, sample_order):
        response = admin_client.get(f'/api/admin/orders/{sample_order.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert 'items' in response.data

    def test_admin_can_update_status(self, admin_client, sample_order):
        response = admin_client.patch(
            f'/api/admin/orders/{sample_order.id}/',
            {'status': 'confirmed'}, format='json'
        )
        assert response.status_code == status.HTTP_200_OK
        assert response.data['status'] == 'confirmed'

    def test_nonexistent_order_returns_404(self, admin_client):
        response = admin_client.get('/api/admin/orders/99999/')
        assert response.status_code == status.HTTP_404_NOT_FOUND