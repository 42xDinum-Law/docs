"""Client for the Légifrance API (PISTE), used to identify official texts
(/suggest) and fetch their canonical content (consult/getArticle(ByCid))."""

import logging
from functools import cache

from django.conf import settings
from django.core.cache import cache as django_cache
from django.core.exceptions import ImproperlyConfigured

import requests

from core.services.external_apis.base import ExternalAPIClient, ExternalAPIError

logger = logging.getLogger(__name__)

LEGIFRANCE_SUGGEST_SUPPLIES = ["LEGI", "JORF"]
LEGIFRANCE_SUGGEST_PAGE_SIZE = 10

_TOKEN_CACHE_KEY = "legifrance:piste_access_token"


class LegifranceApiClient(ExternalAPIClient):
    """Client for the Légifrance API (PISTE), OAuth2 client_credentials authenticated."""

    def __init__(self):
        """Configure the client from settings, failing fast if misconfigured."""
        if not settings.PISTE_CLIENT_ID or not settings.PISTE_CLIENT_SECRET:
            raise ImproperlyConfigured(
                "PISTE_CLIENT_ID/PISTE_CLIENT_SECRET are not configured"
            )

        self.base_url = settings.PISTE_API_URL
        self.oauth_url = settings.PISTE_OAUTH_URL
        self.client_id = settings.PISTE_CLIENT_ID
        self.client_secret = settings.PISTE_CLIENT_SECRET
        self.timeout = settings.PISTE_API_TIMEOUT

    def _headers(self):
        """Build the Authorization header from a cached (or freshly fetched) OAuth token."""
        return {"Authorization": f"Bearer {self._get_access_token()}"}

    def _get_access_token(self):
        token = django_cache.get(_TOKEN_CACHE_KEY)
        if token:
            return token
        return self._fetch_access_token()

    def _fetch_access_token(self):
        """Request a new OAuth2 access token via client_credentials and cache it."""
        try:
            response = requests.post(
                self.oauth_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "scope": "openid",
                },
                timeout=self.timeout,
            )
            response.raise_for_status()
        except requests.RequestException as err:
            logger.exception("Failed to obtain a Légifrance PISTE access token")
            raise ExternalAPIError(
                "Failed to obtain a Légifrance PISTE access token"
            ) from err

        data = response.json()
        token = data["access_token"]
        # Cache slightly under the token's real lifetime so we never serve a
        # token that's about to expire.
        expires_in = data.get("expires_in", 3600)
        django_cache.set(_TOKEN_CACHE_KEY, token, timeout=max(expires_in - 60, 60))
        return token

    def _request(self, method, path, **kwargs):
        """Call the API, retrying once with a freshly fetched token on a 401.

        Overridden rather than reusing `ExternalAPIClient._request`: the base
        implementation converts any non-2xx response into `ExternalAPIError`
        immediately, discarding the status code needed to tell a stale/expired
        cached token (401) apart from a genuine API error worth surfacing as-is.
        """
        url = f"{self.base_url}{path}"
        try:
            response = requests.request(
                method, url, headers=self._headers(), timeout=self.timeout, **kwargs
            )
            if response.status_code == 401:
                django_cache.delete(_TOKEN_CACHE_KEY)
                response = requests.request(
                    method,
                    url,
                    headers=self._headers(),
                    timeout=self.timeout,
                    **kwargs,
                )
            response.raise_for_status()
        except requests.RequestException as err:
            logger.exception("External API call to %s failed", url)
            raise ExternalAPIError(f"External API call to {path} failed") from err

        return response.json()

    def suggest(self, search_text: str, page: int = 1) -> dict:
        """Suggest official texts matching `search_text`, restricted to LEGI/JORF.

        `pageNumber`/`pageSize` support on /suggest specifically is unverified
        (the reference implementation this was built from doesn't send them) -
        harmless to include if ignored, since the frontend's infinite scroll
        doesn't rely on the API honoring them either way.
        """
        return self.post(
            "/suggest",
            json={
                "documentsDits": True,
                "searchText": search_text,
                "supplies": LEGIFRANCE_SUGGEST_SUPPLIES,
                "pageNumber": page,
                "pageSize": LEGIFRANCE_SUGGEST_PAGE_SIZE,
            },
        )

    def get_article(self, article_id: str) -> dict:
        """Fetch an article's canonical content by its LEGIARTI/JORFARTI id."""
        return self.post("/consult/getArticle", json={"id": article_id})

    def get_article_by_cid(self, cid: str) -> dict:
        """Fetch an article's canonical content by its CID."""
        return self.post("/consult/getArticleByCid", json={"cid": cid})


@cache
def get_legifrance_api_client() -> LegifranceApiClient:
    """Return a cached, configured instance of the Légifrance API client."""
    return LegifranceApiClient()
