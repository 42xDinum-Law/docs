"""Client for the Albert API (Etalab), used here to search the Légifrance collection."""

from functools import cache

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

from core.services.external_apis.base import ExternalAPIClient

LEGIFRANCE_STATUS_IN_FORCE = "VIGUEUR"

# Lexical search is prone to burying exact references (e.g. "décret 84-1110")
# among many loosely-related chunks, since number tokens are common across the
# whole corpus. Casting a wide net then reranking recovers the right chunk
# without giving up the speed/cost of a lexical first pass.
SEARCH_RECALL_LIMIT = 50
RERANK_TOP_N = 10


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
        self.rerank_model = settings.ALBERT_RERANK_MODEL

    def search_legifrance(self, query: str, category: str | None = None) -> dict:
        """Search in-force (VIGUEUR) Légifrance texts, optionally restricted to Codes.

        Retrieves a broad pool of lexical matches, then reranks them so the
        most relevant chunk (e.g. an exact article/decree reference) surfaces
        first even when it wasn't the top lexical hit.
        """
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

        search_result = self.post(
            "/search",
            json={
                "query": query,
                "collection_ids": [self.collection_id],
                "method": "lexical",
                "metadata_filters": metadata_filters,
                "limit": SEARCH_RECALL_LIMIT,
            },
        )
        return self._rerank(query, search_result)

    def _rerank(self, query: str, search_result: dict) -> dict:
        """Reorder search results by relevance using the Albert rerank endpoint."""
        data = search_result.get("data") or []
        if not data:
            return search_result

        rerank_result = self.post(
            "/rerank",
            json={
                "model": self.rerank_model,
                "query": query,
                "documents": [item["chunk"]["content"] for item in data],
                "top_n": min(RERANK_TOP_N, len(data)),
            },
        )

        reranked_data = [
            {**data[result["index"]], "score": result["relevance_score"]}
            for result in rerank_result["results"]
        ]
        return {**search_result, "data": reranked_data}


@cache
def get_albert_api_client() -> AlbertApiClient:
    """Return a cached, configured instance of the Albert API client."""
    return AlbertApiClient()
