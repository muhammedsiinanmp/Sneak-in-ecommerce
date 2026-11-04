import pytest
from rest_framework import status
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory, force_authenticate
from rest_framework.views import APIView


class UnconfiguredView(APIView):
    """A view that does not declare permission_classes."""

    def get(self, request):
        return Response({"ok": True})


@pytest.mark.django_db
class TestDefaultPermission:
    def test_view_without_permission_classes_rejects_anonymous(self):
        request = APIRequestFactory().get("/")

        response = UnconfiguredView.as_view()(request)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_view_without_permission_classes_allows_authenticated(
        self, regular_user
    ):
        request = APIRequestFactory().get("/")
        force_authenticate(request, user=regular_user)

        response = UnconfiguredView.as_view()(request)

        assert response.status_code == status.HTTP_200_OK


@pytest.mark.django_db
class TestPublicEndpointsStayPublic:
    @pytest.mark.parametrize(
        "url",
        [
            "/api/products/",
            "/api/brands/",
            "/api/categories/",
            "/api/subcategories/",
            "/api/schema/",
        ],
    )
    def test_anonymous_get(self, unauthenticated_client, url):
        response = unauthenticated_client.get(url)

        assert response.status_code == status.HTTP_200_OK

    def test_anonymous_product_detail(self, unauthenticated_client, sample_product):
        response = unauthenticated_client.get(f"/api/products/{sample_product.id}/")

        assert response.status_code == status.HTTP_200_OK

    def test_anonymous_health_check_is_not_auth_gated(self, unauthenticated_client):
        response = unauthenticated_client.get("/api/health/")

        # 503 is a legitimate answer when Redis is unavailable in the test run.
        assert response.status_code in (
            status.HTTP_200_OK,
            status.HTTP_503_SERVICE_UNAVAILABLE,
        )

    def test_anonymous_login_and_refresh(self, unauthenticated_client, regular_user):
        login = unauthenticated_client.post(
            "/api/auth/login/",
            {"email": "user@test.com", "password": "user123456"},
            format="json",
        )
        assert login.status_code == status.HTTP_200_OK

        refresh = unauthenticated_client.post(
            "/api/auth/token/refresh/",
            {"refresh": login.data["refresh"]},
            format="json",
        )
        assert refresh.status_code == status.HTTP_200_OK

    def test_private_endpoints_reject_anonymous(self, unauthenticated_client):
        for url in ("/api/cart/", "/api/orders/", "/api/wishlist/"):
            response = unauthenticated_client.get(url)

            assert response.status_code == status.HTTP_401_UNAUTHORIZED, url
