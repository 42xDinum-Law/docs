"""Generic HTTP client for calling external third-party APIs."""

import logging

import requests

logger = logging.getLogger(__name__)


class ExternalAPIError(Exception):
    """Raised when a call to an external API fails."""


class ExternalAPIClient:
    """Small requests-based client for a bearer-token-authenticated JSON API.

    Subclasses set `base_url`, `api_key` and `timeout` in `__init__` (validating
    required settings there, raising `django.core.exceptions.ImproperlyConfigured`
    if missing) and use `get`/`post` to call the API.
    """

    base_url: str
    api_key: str
    timeout: int = 10

    def _headers(self):
        """Build the Authorization header for the external API."""
        return {"Authorization": f"Bearer {self.api_key}"}

    def _request(self, method, path, **kwargs):
        """Call the external API and raise `ExternalAPIError` on failure."""
        url = f"{self.base_url}{path}"
        try:
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

    def get(self, path, params=None):
        """Perform a GET request against the external API."""
        return self._request("GET", path, params=params)

    def post(self, path, json=None):
        """Perform a POST request against the external API."""
        return self._request("POST", path, json=json)
