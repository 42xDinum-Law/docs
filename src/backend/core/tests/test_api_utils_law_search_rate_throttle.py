"""
Test that LawSearchRateThrottle has its own budget, separate from AIUserRateThrottle.
"""

from unittest.mock import patch
from uuid import uuid4

from django.test import override_settings

import pytest
from rest_framework.response import Response
from rest_framework.test import APIRequestFactory
from rest_framework.views import APIView

from core.api.utils import AIUserRateThrottle, LawSearchRateThrottle
from core.factories import UserFactory

pytestmark = pytest.mark.django_db


class AIView(APIView):
    """A simple view throttled like the AI assistant endpoints."""

    throttle_classes = [AIUserRateThrottle]

    def get(self, request, *args, **kwargs):
        """Minimal get method for testing purposes."""
        return Response({"message": "Success"})


class LawSearchView(APIView):
    """A simple view throttled like the law search endpoint."""

    throttle_classes = [LawSearchRateThrottle]

    def get(self, request, *args, **kwargs):
        """Minimal get method for testing purposes."""
        return Response({"message": "Success"})


@override_settings(
    AI_USER_RATE_THROTTLE_RATES={"minute": 1, "hour": 1, "day": 1},
    LAW_SEARCH_RATE_THROTTLE_RATES={"minute": 3, "hour": 6, "day": 10},
)
@patch("time.time")
def test_law_search_rate_throttle_has_its_own_budget(mock_time):
    """Exhausting the AI assistant's throttle should not affect law search."""
    user = UserFactory()
    api_rf = APIRequestFactory()
    mock_time.return_value = 1000000

    request = api_rf.get(f"/documents/{uuid4()!s}/")
    request.user = user
    assert AIView.as_view()(request).status_code == 200

    # The AI throttle only allows 1 request per minute: the next one is throttled.
    request = api_rf.get(f"/documents/{uuid4()!s}/")
    request.user = user
    assert AIView.as_view()(request).status_code == 429

    # Law search has its own budget, so it's unaffected by the AI throttle above.
    request = api_rf.get(f"/documents/{uuid4()!s}/")
    request.user = user
    assert LawSearchView.as_view()(request).status_code == 200
