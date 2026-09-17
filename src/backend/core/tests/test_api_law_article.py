"""Test the law-article API endpoint."""

from unittest.mock import patch

import pytest
from rest_framework.test import APIClient

from core import factories
from core.services.external_apis.base import ExternalAPIError
from core.services.external_apis.legifrance import get_legifrance_api_client

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def law_article_settings(settings):
    """Fixture to enable the law search feature and configure PISTE settings."""
    settings.LAW_SEARCH_FEATURE_ENABLED = True
    settings.PISTE_CLIENT_ID = "test-client-id"
    settings.PISTE_CLIENT_SECRET = "test-client-secret"
    yield
    get_legifrance_api_client.cache_clear()


def test_api_law_article_anonymous_forbidden():
    """Anonymous users should not be able to fetch a law article."""
    response = APIClient().get(
        "/api/v1.0/law-article/", {"id": "LEGIARTI000033205136"}
    )

    assert response.status_code == 401


def test_api_law_article_feature_disabled(settings):
    """The endpoint should return 400 when the feature flag is off."""
    settings.LAW_SEARCH_FEATURE_ENABLED = False
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-article/", {"id": "LEGIARTI000033205136"})

    assert response.status_code == 400


def test_api_law_article_missing_id_and_cid():
    """The endpoint should return 400 when neither 'id' nor 'cid' is given."""
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-article/")

    assert response.status_code == 400


def test_api_law_article_both_id_and_cid():
    """The endpoint should return 400 when both 'id' and 'cid' are given."""
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get(
        "/api/v1.0/law-article/",
        {"id": "LEGIARTI000033205136", "cid": "JORFARTI000033202984"},
    )

    assert response.status_code == 400


@patch("core.api.viewsets.get_legifrance_api_client")
def test_api_law_article_success_by_id(mock_get_client):
    """A valid request with 'id' should call get_article and proxy the response."""
    mock_get_client.return_value.get_article.return_value = {
        "article": {"id": "LEGIARTI000033205136", "texte": "..."}
    }
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-article/", {"id": "LEGIARTI000033205136"})

    assert response.status_code == 200
    assert response.json()["article"]["id"] == "LEGIARTI000033205136"
    mock_get_client.return_value.get_article.assert_called_once_with(
        "LEGIARTI000033205136"
    )
    mock_get_client.return_value.get_article_by_cid.assert_not_called()


@patch("core.api.viewsets.get_legifrance_api_client")
def test_api_law_article_success_by_cid(mock_get_client):
    """A valid request with 'cid' should call get_article_by_cid instead."""
    mock_get_client.return_value.get_article_by_cid.return_value = {
        "article": {"cid": "JORFARTI000033202984", "texte": "..."}
    }
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-article/", {"cid": "JORFARTI000033202984"})

    assert response.status_code == 200
    mock_get_client.return_value.get_article_by_cid.assert_called_once_with(
        "JORFARTI000033202984"
    )
    mock_get_client.return_value.get_article.assert_not_called()


@patch("core.api.viewsets.get_legifrance_api_client")
def test_api_law_article_external_api_error(mock_get_client):
    """An ExternalAPIError from the client should surface as a 502."""
    mock_get_client.return_value.get_article.side_effect = ExternalAPIError("boom")
    client = APIClient()
    client.force_login(factories.UserFactory())

    response = client.get("/api/v1.0/law-article/", {"id": "LEGIARTI000033205136"})

    assert response.status_code == 502
