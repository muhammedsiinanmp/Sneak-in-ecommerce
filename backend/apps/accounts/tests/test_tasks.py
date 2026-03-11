import pytest
from unittest.mock import patch
from apps.accounts.tasks import send_welcome_email


@pytest.mark.django_db
class TestWelcomeEmailTask:

    @patch("apps.accounts.tasks.send_mail")
    def test_welcome_email_sends(self, mock_send_mail):
        result = send_welcome_email("test@example.com", "Test User")
        mock_send_mail.assert_called_once()
        assert "test@example.com" in result
