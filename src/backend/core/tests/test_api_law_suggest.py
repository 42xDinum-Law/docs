"""Test the law-suggest API endpoint."""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from core import factories
from core.services.external_apis.base import ExternalAPIError
from core.services.external_apis.legifrance import get_legifrance_api_client

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def law_suggest_settings(settings):
    """Fixture to enable the law search feature and configure PISTE settings."""
    settings.LAW_SEARCH_FEATURE_ENABLED = True
    settings.PISTE_CLIENT_ID = "test-client-id"
    settings.PISTE_CLIENT_SECRET = "test-client-secret"
    yield
    get_legifrance_api_client.cache_clear()


def test_api_law_suggest_anonymous_forbidden():
    """Anonymous users should not be able to get law suggestions."""
    response = APIClient().get("/api/v1.0/law-suggest/", {"q": "route"})

    assert response.status_code == 401


def test_api_law_suggest_feature_disabled(settings):
    """The endpoint should return 400 when the feature flag is off."""
    settings.LAW_SEARCH_FEATURE_ENABLED = False
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-suggest/", {"q": "route"})

    assert response.status_code == 400


def test_api_law_suggest_missing_query():
    """The endpoint should return 400 when the 'q' parameter is missing."""
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-suggest/")

    assert response.status_code == 400


def test_api_law_suggest_invalid_page():
    """The endpoint should return 400 when 'page' is not a positive integer."""
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-suggest/", {"q": "route", "page": 0})

    assert response.status_code == 400


@patch("core.api.viewsets.get_legifrance_api_client")
def test_api_law_suggest_success(mock_get_client):
    """A valid, authenticated request should return the Légifrance response as-is."""
    mock_get_client.return_value.suggest.return_value = {
        "results": [{"id": "LEGITEXT000006074220", "label": "Code de l'environnement"}]
    }
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-suggest/", {"q": "environnement", "page": 2})

    assert response.status_code == 200
    assert response.json()["results"][0]["id"] == "LEGITEXT000006074220"
    mock_get_client.return_value.suggest.assert_called_once_with("environnement", 2)


@patch("core.api.viewsets.get_legifrance_api_client")
def test_api_law_suggest_external_api_error(mock_get_client):
    """An ExternalAPIError from the client should surface as a 502."""
    mock_get_client.return_value.suggest.side_effect = ExternalAPIError("boom")
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-suggest/", {"q": "route"})

    assert response.status_code == 502
