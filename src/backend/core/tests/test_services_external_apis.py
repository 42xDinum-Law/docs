"""Tests for the generic external API client and the Albert API client."""

import json

from django.core.exceptions import ImproperlyConfigured

import pytest
import responses
from requests.exceptions import ConnectTimeout

from core.services.external_apis.albert import AlbertApiClient, get_albert_api_client
from core.services.external_apis.base import ExternalAPIClient, ExternalAPIError

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def albert_settings(settings):
    """Fixture to set Albert API settings."""
    settings.ALBERT_API_BASE_URL = "https://albert.example.com/v1"
    settings.ALBERT_API_KEY = "test-key"
    settings.ALBERT_API_TIMEOUT = 5
    settings.LAW_SEARCH_LEGIFRANCE_COLLECTION_ID = 139226
    yield
    get_albert_api_client.cache_clear()


class TestExternalAPIClient:
    """Tests for the generic ExternalAPIClient."""

    @responses.activate
    def test_post_returns_json_on_success(self):
        """post() should return the parsed JSON body on success."""
        client = ExternalAPIClient()
        client.base_url = "https://example.com"
        client.api_key = "secret"

        responses.post(
            "https://example.com/search",
            json={"object": "list", "data": []},
        )

        result = client.post("/search", json={"query": "test"})

        assert result == {"object": "list", "data": []}
        assert responses.calls[0].request.headers["Authorization"] == "Bearer secret"

    @responses.activate
    def test_request_wraps_connection_errors(self):
        """A requests.RequestException should never leak out of the client."""
        client = ExternalAPIClient()
        client.base_url = "https://example.com"
        client.api_key = "secret"

        responses.add(
            responses.POST, "https://example.com/search", body=ConnectTimeout()
        )

        with pytest.raises(ExternalAPIError):
            client.post("/search", json={})

    @responses.activate
    def test_request_wraps_http_error_status(self):
        """A non-2xx response should be raised as ExternalAPIError."""
        client = ExternalAPIClient()
        client.base_url = "https://example.com"
        client.api_key = "secret"

        responses.post("https://example.com/search", json={}, status=500)

        with pytest.raises(ExternalAPIError):
            client.post("/search", json={})


class TestAlbertApiClient:
    """Tests for the Albert API client (Légifrance search)."""

    def test_init_requires_api_key(self, settings):
        """Instantiation should fail fast when ALBERT_API_KEY is missing."""
        settings.ALBERT_API_KEY = None

        with pytest.raises(ImproperlyConfigured):
            AlbertApiClient()

    def test_init_requires_collection_id(self, settings):
        """Instantiation should fail fast when the collection id is missing."""
        settings.LAW_SEARCH_LEGIFRANCE_COLLECTION_ID = None

        with pytest.raises(ImproperlyConfigured):
            AlbertApiClient()

    @responses.activate
    def test_search_legifrance_default_filters_on_status(self):
        """Without a category, only the VIGUEUR status filter should be sent."""
        mocked = responses.post(
            "https://albert.example.com/v1/search",
            json={"object": "list", "data": []},
        )

        AlbertApiClient().search_legifrance("droit à l'oubli")

        payload = mocked.calls[0].request.body
        body = json.loads(payload)
        assert body["query"] == "droit à l'oubli"
        assert body["collection_ids"] == [139226]
        assert body["method"] == "lexical"
        assert body["limit"] == 50
        assert body["metadata_filters"] == {
            "key": "status",
            "type": "eq",
            "value": "VIGUEUR",
        }

    @responses.activate
    def test_search_legifrance_with_category_combines_filters(self):
        """With a category, status and category should be combined with 'and'."""
        mocked = responses.post(
            "https://albert.example.com/v1/search",
            json={"object": "list", "data": []},
        )

        AlbertApiClient().search_legifrance("route", category="CODE")

        body = json.loads(mocked.calls[0].request.body)
        assert body["metadata_filters"] == {
            "operator": "and",
            "filters": [
                {"key": "status", "type": "eq", "value": "VIGUEUR"},
                {"key": "category", "type": "eq", "value": "CODE"},
            ],
        }

    def test_get_albert_api_client_is_cached(self):
        """get_albert_api_client() should return the same instance on repeat calls."""
        assert get_albert_api_client() is get_albert_api_client()

    @responses.activate
    def test_search_legifrance_reorders_results_by_rerank_score(self):
        """Results should come back in rerank order, not lexical search order."""
        responses.post(
            "https://albert.example.com/v1/search",
            json={
                "object": "list",
                "data": [
                    {"chunk": {"content": "chunk about roads in general"}},
                    {"chunk": {"content": "Décret n°84-1110 du 14 décembre 1984"}},
                ],
            },
        )
        mocked_rerank = responses.post(
            "https://albert.example.com/v1/rerank",
            json={
                "results": [
                    {"index": 1, "relevance_score": 0.95},
                    {"index": 0, "relevance_score": 0.2},
                ]
            },
        )

        result = AlbertApiClient().search_legifrance("décret 84-1110")

        rerank_body = json.loads(mocked_rerank.calls[0].request.body)
        assert rerank_body["model"] == "openweight-rerank"
        assert rerank_body["query"] == "décret 84-1110"
        assert rerank_body["documents"] == [
            "chunk about roads in general",
            "Décret n°84-1110 du 14 décembre 1984",
        ]
        assert rerank_body["top_n"] == 2

        assert result["data"][0]["chunk"]["content"] == (
            "Décret n°84-1110 du 14 décembre 1984"
        )
        assert result["data"][0]["score"] == 0.95
        assert result["data"][1]["score"] == 0.2

    @responses.activate
    def test_search_legifrance_skips_rerank_when_no_results(self):
        """No rerank call should be made when the search returns no data."""
        responses.post(
            "https://albert.example.com/v1/search",
            json={"object": "list", "data": []},
        )

        result = AlbertApiClient().search_legifrance("route")

        assert result == {"object": "list", "data": []}
        assert len(responses.calls) == 1
