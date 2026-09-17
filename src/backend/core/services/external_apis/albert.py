"""Client for the Albert API (Etalab), used here to search the Légifrance collection."""

from functools import cache

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from core.services.external_apis.base import ExternalAPIClient

LEGIFRANCE_STATUS_IN_FORCE = "VIGUEUR"


class AlbertApiClient(ExternalAPIClient):
    """Client for the Albert API, scoped to the Légifrance search collection."""

    def __init__(self):
        """Configure the client from settings, failing fast if misconfigured."""
        if not settings.ALBERT_API_KEY:
            raise ImproperlyConfigured("ALBERT_API_KEY is not configured")
        if not settings.LAW_SEARCH_LEGIFRANCE_COLLECTION_ID:
            raise ImproperlyConfigured(
                "LAW_SEARCH_LEGIFRANCE_COLLECTION_ID is not configured"
            )

        self.base_url = settings.ALBERT_API_BASE_URL
        self.api_key = settings.ALBERT_API_KEY
        self.timeout = settings.ALBERT_API_TIMEOUT
        self.collection_id = settings.LAW_SEARCH_LEGIFRANCE_COLLECTION_ID

    def search_legifrance(self, query: str, category: str | None = None) -> dict:
        """Search in-force (VIGUEUR) Légifrance texts, optionally restricted to Codes."""
        filters = [
            {"key": "status", "type": "eq", "value": LEGIFRANCE_STATUS_IN_FORCE}
        ]
        if category:
            filters.append({"key": "category", "type": "eq", "value": category})

        metadata_filters = (
            filters[0]
            if len(filters) == 1
            else {"operator": "and", "filters": filters}
        )

        return self.post(
            "/search",
            json={
                "query": query,
                "collection_ids": [self.collection_id],
                "method": "semantic",
                "metadata_filters": metadata_filters,
            },
        )


@cache
def get_albert_api_client() -> AlbertApiClient:
    """Return a cached, configured instance of the Albert API client."""
    return AlbertApiClient()
