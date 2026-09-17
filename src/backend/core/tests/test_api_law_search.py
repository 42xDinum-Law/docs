"""Test the law-search API endpoint."""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from core import factories
from core.services.external_apis.albert import get_albert_api_client
from core.services.external_apis.base import ExternalAPIError

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def law_search_settings(settings):
    """Fixture to enable the law search feature and configure Albert API settings."""
    settings.LAW_SEARCH_FEATURE_ENABLED = True
    settings.ALBERT_API_KEY = "test-key"
    settings.LAW_SEARCH_LEGIFRANCE_COLLECTION_ID = 139226
    yield
    get_albert_api_client.cache_clear()


def test_api_law_search_anonymous_forbidden():
    """Anonymous users should not be able to search law articles."""
    response = APIClient().get("/api/v1.0/law-search/", {"q": "route"})

    assert response.status_code == 401


def test_api_law_search_feature_disabled(settings):
    """The endpoint should return 400 when the feature flag is off."""
    settings.LAW_SEARCH_FEATURE_ENABLED = False
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-search/", {"q": "route"})

    assert response.status_code == 400


def test_api_law_search_missing_query():
    """The endpoint should return 400 when the 'q' parameter is missing."""
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-search/")

    assert response.status_code == 400


@patch("core.api.viewsets.get_albert_api_client")
def test_api_law_search_success(mock_get_client):
    """A valid, authenticated request should return the Albert API response as-is."""
    mock_get_client.return_value.search_legifrance.return_value = {
        "object": "list",
        "data": [{"method": "semantic", "score": 0.8, "chunk": {"content": "..."}}],
    }
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-search/", {"q": "route"})

    assert response.status_code == 200
    assert response.json()["object"] == "list"
    mock_get_client.return_value.search_legifrance.assert_called_once_with("route")


@patch("core.api.viewsets.get_albert_api_client")
def test_api_law_search_external_api_error(mock_get_client):
    """An ExternalAPIError from the client should surface as a 502."""
    mock_get_client.return_value.search_legifrance.side_effect = ExternalAPIError(
        "boom"
    )
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-search/", {"q": "route"})

    assert response.status_code == 502
