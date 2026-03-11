import pytest
from rest_framework import status


@pytest.mark.django_db
class TestAdminProductListCreateAPIView:
    """Tests for /api/admin/products/"""

    def test_admin_can_list_products(self, admin_client, sample_product):
        response = admin_client.get('/api/admin/products/')
        assert response.status_code == status.HTTP_200_OK
        assert len(response.data) >= 1

    def test_admin_can_create_product(self, admin_client, sample_brand, sample_category, sample_subcategory):
        data = {
            'name': 'New Sneaker',
            'brand': sample_brand.id,
            'category': sample_category.id,
            'subcategory': sample_subcategory.id,
            'price': '9999.00',
            'mrp': '12999.00',
            'description': 'A test sneaker',
            'in_stock': True,
            'stock': 25,
        }
        response = admin_client.post('/api/admin/products/', data, format='json')
        assert response.status_code == status.HTTP_201_CREATED
        assert response.data['name'] == 'New Sneaker'

    def test_regular_user_forbidden(self, user_client):
        response = user_client.get('/api/admin/products/')
        assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.django_db
class TestAdminProductDetailAPIView:
    """Tests for /api/admin/products/<id>/"""

    def test_admin_can_view_product(self, admin_client, sample_product):
        response = admin_client.get(f'/api/admin/products/{sample_product.id}/')
        assert response.status_code == status.HTTP_200_OK
        assert response.data['name'] == sample_product.name

    def test_admin_can_update_product(self, admin_client, sample_product):
        response = admin_client.patch(
            f'/api/admin/products/{sample_product.id}/',
            {'price': '14999.00'}, format='json'
        )
        assert response.status_code == status.HTTP_200_OK

    def test_admin_can_delete_product(self, admin_client, sample_product):
        response = admin_client.delete(f'/api/admin/products/{sample_product.id}/')
        assert response.status_code == status.HTTP_204_NO_CONTENT

    def test_nonexistent_product_returns_404(self, admin_client):
        response = admin_client.get('/api/admin/products/99999/')
        assert response.status_code == status.HTTP_404_NOT_FOUND