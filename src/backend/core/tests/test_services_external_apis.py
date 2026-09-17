"""Tests for the generic external API client and the Albert API client."""

import json

from django.core.cache import cache
from django.core.exceptions import ImproperlyConfigured

import pytest
import responses
from requests.exceptions import ConnectTimeout

from core.services.external_apis.albert import AlbertApiClient, get_albert_api_client
from core.services.external_apis.base import ExternalAPIClient, ExternalAPIError
from core.services.external_apis.legifrance import (
    LegifranceApiClient,
    get_legifrance_api_client,
)

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
        assert body["method"] == "hybrid"
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


@pytest.fixture(autouse=True)
def piste_settings(settings):
    """Fixture to set Légifrance (PISTE) API settings."""
    settings.PISTE_OAUTH_URL = "https://oauth.example.com/token"
    settings.PISTE_API_URL = "https://legifrance.example.com/v1"
    settings.PISTE_CLIENT_ID = "test-client-id"
    settings.PISTE_CLIENT_SECRET = "test-client-secret"
    settings.PISTE_API_TIMEOUT = 5
    yield
    get_legifrance_api_client.cache_clear()
    cache.delete("legifrance:piste_access_token")


class TestLegifranceApiClient:
    """Tests for the Légifrance API client (PISTE)."""

    def test_init_requires_client_id(self, settings):
        """Instantiation should fail fast when PISTE_CLIENT_ID is missing."""
        settings.PISTE_CLIENT_ID = None

        with pytest.raises(ImproperlyConfigured):
            LegifranceApiClient()

    def test_init_requires_client_secret(self, settings):
        """Instantiation should fail fast when PISTE_CLIENT_SECRET is missing."""
        settings.PISTE_CLIENT_SECRET = None

        with pytest.raises(ImproperlyConfigured):
            LegifranceApiClient()

    @responses.activate
    def test_suggest_request_body(self):
        """suggest() should send the query, LEGI/JORF supplies and pagination."""
        responses.post(
            "https://oauth.example.com/token",
            json={"access_token": "token-1", "expires_in": 3600},
        )
        mocked = responses.post(
            "https://legifrance.example.com/v1/suggest",
            json={"results": []},
        )

        LegifranceApiClient().suggest("environnement", page=2)

        body = json.loads(mocked.calls[0].request.body)
        assert body["searchText"] == "environnement"
        assert body["supplies"] == ["LEGI", "JORF"]
        assert body["documentsDits"] is True
        assert body["pageNumber"] == 2
        assert mocked.calls[0].request.headers["Authorization"] == "Bearer token-1"

    @responses.activate
    def test_get_article_request_body(self):
        """get_article() should POST the article id to consult/getArticle."""
        responses.post(
            "https://oauth.example.com/token",
            json={"access_token": "token-1", "expires_in": 3600},
        )
        mocked = responses.post(
            "https://legifrance.example.com/v1/consult/getArticle",
            json={"article": {}},
        )

        LegifranceApiClient().get_article("LEGIARTI000033205136")

        body = json.loads(mocked.calls[0].request.body)
        assert body == {"id": "LEGIARTI000033205136"}

    @responses.activate
    def test_get_article_by_cid_request_body(self):
        """get_article_by_cid() should POST the cid to consult/getArticleByCid."""
        responses.post(
            "https://oauth.example.com/token",
            json={"access_token": "token-1", "expires_in": 3600},
        )
        mocked = responses.post(
            "https://legifrance.example.com/v1/consult/getArticleByCid",
            json={"article": {}},
        )

        LegifranceApiClient().get_article_by_cid("JORFARTI000033202984")

        body = json.loads(mocked.calls[0].request.body)
        assert body == {"cid": "JORFARTI000033202984"}

    @responses.activate
    def test_access_token_is_fetched_once_and_reused(self):
        """A cached token should be reused across calls instead of re-fetched."""
        oauth_mock = responses.post(
            "https://oauth.example.com/token",
            json={"access_token": "token-1", "expires_in": 3600},
        )
        responses.post(
            "https://legifrance.example.com/v1/suggest",
            json={"results": []},
        )

        client = LegifranceApiClient()
        client.suggest("route")
        client.suggest("route")

        assert oauth_mock.call_count == 1

    @responses.activate
    def test_401_forces_token_refresh_and_retries_once(self):
        """A 401 should evict the cached token, fetch a new one, and retry once."""
        responses.add(
            responses.POST,
            "https://oauth.example.com/token",
            json={"access_token": "stale-token", "expires_in": 3600},
        )
        responses.add(
            responses.POST,
            "https://oauth.example.com/token",
            json={"access_token": "fresh-token", "expires_in": 3600},
        )
        responses.add(
            responses.POST,
            "https://legifrance.example.com/v1/suggest",
            json={"detail": "unauthorized"},
            status=401,
        )
        responses.add(
            responses.POST,
            "https://legifrance.example.com/v1/suggest",
            json={"results": []},
        )

        result = LegifranceApiClient().suggest("route")

        assert result == {"results": []}
        suggest_calls = [
            call
            for call in responses.calls
            if call.request.url == "https://legifrance.example.com/v1/suggest"
        ]
        assert len(suggest_calls) == 2
        assert suggest_calls[0].request.headers["Authorization"] == "Bearer stale-token"
        assert suggest_calls[1].request.headers["Authorization"] == "Bearer fresh-token"

    def test_get_legifrance_api_client_is_cached(self):
        """get_legifrance_api_client() should return the same instance on repeat calls."""
        assert get_legifrance_api_client() is get_legifrance_api_client()
