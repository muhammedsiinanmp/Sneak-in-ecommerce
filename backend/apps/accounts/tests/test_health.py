import pytest
from unittest.mock import patch
from rest_framework import status

HEALTH_URL = "/api/health/"
SECRET_ERROR = "could not connect to db-host:5432 user=postgres password=hunter2"


@pytest.mark.django_db
class TestHealthCheckAPIView:
    """Tests for GET /api/health/"""

    @patch("apps.accounts.health_views.redis.Redis.from_url")
    def test_healthy_when_services_are_up(self, mock_from_url, unauthenticated_client):
        response = unauthenticated_client.get(HEALTH_URL)

        assert response.status_code == status.HTTP_200_OK
        assert response.data == {
            "status": "healthy",
            "services": {"database": "up", "redis": "up"},
        }

    @patch("apps.accounts.health_views.redis.Redis.from_url")
    @patch("apps.accounts.health_views.connection.ensure_connection")
    def test_failure_details_are_logged_not_returned(
        self, mock_ensure, mock_from_url, unauthenticated_client, caplog
    ):
        mock_ensure.side_effect = Exception(SECRET_ERROR)
        mock_from_url.return_value.ping.side_effect = Exception(SECRET_ERROR)

        response = unauthenticated_client.get(HEALTH_URL)

        assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
        assert response.data == {
            "status": "unhealthy",
            "services": {"database": "down", "redis": "down"},
        }
        assert SECRET_ERROR not in response.content.decode()
        assert SECRET_ERROR in caplog.text
