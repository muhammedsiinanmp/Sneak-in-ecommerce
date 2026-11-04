import logging

import redis
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from django.db import connection
from django.conf import settings

logger = logging.getLogger(__name__)


class HealthCheckAPIView(APIView):
    """
    GET /api/health/
    Returns the health status of all services.
    """

    permission_classes = [AllowAny]

    def get(self, request):
        health = {"status": "healthy", "services": {}}

        # Check Database
        try:
            connection.ensure_connection()
            health["services"]["database"] = "up"
        except Exception:
            logger.exception("Health check: database is down")
            health["services"]["database"] = "down"
            health["status"] = "unhealthy"

        # Check Redis
        try:
            r = redis.Redis.from_url(
                settings.CELERY_BROKER_URL, socket_connect_timeout=2
            )
            r.ping()
            health["services"]["redis"] = "up"
        except Exception:
            logger.exception("Health check: redis is down")
            health["services"]["redis"] = "down"
            health["status"] = "unhealthy"

        status_code = (
            status.HTTP_200_OK
            if health["status"] == "healthy"
            else status.HTTP_503_SERVICE_UNAVAILABLE
        )

        return Response(health, status=status_code)
