from decimal import Decimal

import pytest
from rest_framework import status

from apps.cart.models import CartItem
from apps.orders.models import Order

PLACE_URL = "/api/orders/place/"
ADDRESS = {"name": "Regular User", "street": "123 Test Street", "city": "Kochi"}


def place_payload(**overrides):
    payload = {"payment_method": "cod", "shipping_address": ADDRESS}
    payload.update(overrides)
    return payload


@pytest.mark.django_db
class TestPlaceOrderView:
    """Tests for POST /api/orders/place/"""

    def test_place_order_creates_order_from_cart(
        self, user_client, regular_user, sample_product
    ):
        CartItem.objects.create(
            cart=regular_user.cart, product=sample_product, size=42, quantity=2
        )

        response = user_client.post(
            PLACE_URL,
            # A client-supplied total must be ignored.
            place_payload(total_amount="1.00"),
            format="json",
        )

        assert response.status_code == status.HTTP_201_CREATED
        order = Order.objects.get(user=regular_user)
        assert order.status == "pending"
        assert order.payment_method == "cod"
        assert order.total_amount == Decimal("25998.00")
        assert response.data["shipping_address"] == ADDRESS

        item = order.items.get()
        assert item.product == sample_product
        assert item.quantity == 2
        assert item.size == 42
        assert item.price == Decimal("12999.00")

        sample_product.refresh_from_db()
        assert sample_product.stock == 48
        assert sample_product.in_stock is True
        assert not regular_user.cart.items.exists()

    def test_place_order_marks_product_out_of_stock_at_zero(
        self, user_client, regular_user, sample_product
    ):
        CartItem.objects.create(
            cart=regular_user.cart, product=sample_product, size=42, quantity=50
        )

        response = user_client.post(PLACE_URL, place_payload(), format="json")

        assert response.status_code == status.HTTP_201_CREATED
        sample_product.refresh_from_db()
        assert sample_product.stock == 0
        assert sample_product.in_stock is False

    def test_empty_cart_is_rejected(self, user_client, regular_user):
        response = user_client.post(PLACE_URL, place_payload(), format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Order.objects.filter(user=regular_user).exists()

    def test_insufficient_stock_is_rejected_without_changes(
        self, user_client, regular_user, sample_product
    ):
        CartItem.objects.create(
            cart=regular_user.cart, product=sample_product, size=42, quantity=51
        )

        response = user_client.post(PLACE_URL, place_payload(), format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not Order.objects.filter(user=regular_user).exists()
        sample_product.refresh_from_db()
        assert sample_product.stock == 50
        assert regular_user.cart.items.count() == 1

    def test_same_product_in_two_sizes_is_checked_against_total_stock(
        self, user_client, regular_user, sample_product
    ):
        CartItem.objects.create(
            cart=regular_user.cart, product=sample_product, size=41, quantity=30
        )
        CartItem.objects.create(
            cart=regular_user.cart, product=sample_product, size=42, quantity=30
        )

        response = user_client.post(PLACE_URL, place_payload(), format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        sample_product.refresh_from_db()
        assert sample_product.stock == 50

    def test_same_product_in_two_sizes_decrements_stock_for_both(
        self, user_client, regular_user, sample_product
    ):
        CartItem.objects.create(
            cart=regular_user.cart, product=sample_product, size=41, quantity=2
        )
        CartItem.objects.create(
            cart=regular_user.cart, product=sample_product, size=42, quantity=3
        )

        response = user_client.post(PLACE_URL, place_payload(), format="json")

        assert response.status_code == status.HTTP_201_CREATED
        sample_product.refresh_from_db()
        assert sample_product.stock == 45

    def test_unauthenticated_user_cannot_place_order(self, unauthenticated_client):
        response = unauthenticated_client.post(
            PLACE_URL, place_payload(), format="json"
        )

        assert response.status_code == status.HTTP_401_UNAUTHORIZED


@pytest.mark.django_db
class TestUserCancelOrder:
    """Tests for PATCH /api/orders/<id>/cancel/"""

    def url(self, order):
        return f"/api/orders/{order.id}/cancel/"

    def test_cancel_restores_stock(self, user_client, sample_order, sample_product):
        response = user_client.patch(self.url(sample_order))

        assert response.status_code == status.HTTP_200_OK
        sample_order.refresh_from_db()
        assert sample_order.status == "cancelled"
        sample_product.refresh_from_db()
        assert sample_product.stock == 51

    def test_cancelling_twice_restores_stock_once(
        self, user_client, sample_order, sample_product
    ):
        first = user_client.patch(self.url(sample_order))
        second = user_client.patch(self.url(sample_order))

        assert first.status_code == status.HTTP_200_OK
        assert second.status_code == status.HTTP_400_BAD_REQUEST
        sample_product.refresh_from_db()
        assert sample_product.stock == 51

    def test_already_cancelled_item_does_not_restore_stock_again(
        self, user_client, sample_order, sample_product
    ):
        sample_order.items.update(cancelled=True)

        response = user_client.patch(self.url(sample_order))

        assert response.status_code == status.HTTP_200_OK
        sample_product.refresh_from_db()
        assert sample_product.stock == 50

    def test_user_cannot_cancel_another_users_order(
        self, admin_client, sample_order, sample_product
    ):
        response = admin_client.patch(self.url(sample_order))

        assert response.status_code == status.HTTP_404_NOT_FOUND
        sample_order.refresh_from_db()
        assert sample_order.status == "pending"
        sample_product.refresh_from_db()
        assert sample_product.stock == 50
