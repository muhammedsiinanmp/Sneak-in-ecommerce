import pytest
from unittest.mock import patch
from django.contrib.auth import get_user_model
from rest_framework import status

User = get_user_model()

REGISTER_URL = "/api/auth/register/"


def register_payload(password):
    return {
        "name": "New User",
        "email": "new@test.com",
        "password": password,
        "password2": password,
    }


@pytest.mark.django_db
@patch("apps.accounts.views.send_welcome_email.delay")
class TestRegisterView:
    """Tests for POST /api/auth/register/"""

    def test_register_with_strong_password(self, mock_delay, unauthenticated_client):
        response = unauthenticated_client.post(
            REGISTER_URL, register_payload("Tr1cky-Sneaker-42"), format="json"
        )

        assert response.status_code == status.HTTP_201_CREATED
        assert "access" in response.data["tokens"]
        user = User.objects.get(email="new@test.com")
        assert user.check_password("Tr1cky-Sneaker-42")
        mock_delay.assert_called_once_with("new@test.com", "New User")

    @pytest.mark.parametrize("password", ["12345678", "password", "Xq7#pz1"])
    def test_register_rejects_weak_password(
        self, mock_delay, unauthenticated_client, password
    ):
        response = unauthenticated_client.post(
            REGISTER_URL, register_payload(password), format="json"
        )

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "password" in response.data
        assert not User.objects.filter(email="new@test.com").exists()
        mock_delay.assert_not_called()

    def test_register_rejects_mismatched_passwords(
        self, mock_delay, unauthenticated_client
    ):
        payload = register_payload("Tr1cky-Sneaker-42")
        payload["password2"] = "Different-Sneaker-42"

        response = unauthenticated_client.post(REGISTER_URL, payload, format="json")

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert not User.objects.filter(email="new@test.com").exists()
