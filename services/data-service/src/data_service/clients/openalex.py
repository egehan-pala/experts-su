"""Asynchronous client for the OpenAlex API.

This module wraps the OpenAlex REST API to provide higher‑level
generator functions for iterating over authors and works associated with
an institution. It uses the httpx library to perform asynchronous HTTP
requests and respects the API's rate limits by sleeping between calls.
Requests are retried automatically on transient errors using tenacity.
"""

from __future__ import annotations

import asyncio
from typing import AsyncIterator, Dict, Optional

import httpx
from tenacity import (retry, stop_after_attempt, wait_exponential_jitter,
                      retry_if_exception_type)

from ..config import Settings


class OpenAlexError(Exception):
    """Raised when a non‑transient error occurs while calling the OpenAlex API."""


class OpenAlexClient:
    """Client for interacting with the OpenAlex API.

    Parameters
    ----------
    settings: Settings
        Configuration object containing API URL, ROR ID and rate limit.
    http_client: Optional[httpx.AsyncClient]
        Pass an existing AsyncClient when unit testing to avoid creating
        additional connection pools.
    """

    def __init__(self, settings: Settings, http_client: Optional[httpx.AsyncClient] = None) -> None:
        self._settings = settings
        self._base_url = settings.openalex_base_url.rstrip("/")
        self._ror_id = settings.openalex_ror_id
        self._mailto = settings.openalex_mailto
        self._rate_interval = 60.0 / max(1, settings.openalex_rate_limit_per_min)
        self._client = http_client or httpx.AsyncClient(timeout=30.0)

    async def close(self) -> None:
        """Close the underlying HTTP client. Should be called when the client is no longer needed."""
        await self._client.aclose()

    async def _sleep_for_rate_limit(self) -> None:
        """Sleep for the configured interval to respect the per‑minute rate limit."""
        await asyncio.sleep(self._rate_interval)

    @retry(
        retry=retry_if_exception_type((httpx.TransportError, httpx.HTTPStatusError)),
        wait=wait_exponential_jitter(initial=1, max=10),
        stop=stop_after_attempt(5),
        reraise=True,
    )
    async def _get(self, path: str, params: Dict[str, str | int | None]) -> Dict:
        """Internal helper to perform a GET request with retries and rate limiting."""
        # Add polite pool identifier if provided
        if self._mailto:
            params = dict(params)  # copy to avoid mutating caller's dict
            params["mailto"] = self._mailto
        url = f"{self._base_url}{path}"
        response = await self._client.get(url, params=params)
        try:
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            # Surface 4xx and 5xx as OpenAlexError to break the retry loop for non‑retryable codes
            if 400 <= exc.response.status_code < 500 and exc.response.status_code != 429:
                raise OpenAlexError(f"OpenAlex API returned {exc.response.status_code}: {exc.response.text}") from exc
            # re‑raise for tenacity to retry on 429 and 5xx
            raise
        await self._sleep_for_rate_limit()
        return response.json()

    async def fetch_authors_by_ror(self, since: Optional[str] = None) -> AsyncIterator[Dict]:
        """Yield all authors affiliated with the configured ROR ID.

        Parameters
        ----------
        since: Optional[str]
            Optional ISO date (YYYY-MM-DD). When provided, only authors
            updated on or after this date will be returned. Note that this
            filter requires premium access; without a premium key the API will
            ignore this parameter.
        """
        filter_param = f"institutions.ror:{self._ror_id}"
        params: Dict[str, str | int | None] = {
            "filter": filter_param,
            "per-page": self._settings.batch_size,
            "cursor": "*",
        }
        # When a since date is provided we add the from_updated_date filter. This
        # filter is only honoured for premium API keys; when absent it will be
        # ignored. Keeping it here allows incremental syncs when premium access
        # is available. See: https://docs.openalex.org/how-to-use-the-api/filter-entity-lists
        if since:
            params["from_updated_date"] = since
        while True:
            data = await self._get("/authors", params)
            results = data.get("results", [])
            for item in results:
                yield item
            next_cursor = data.get("meta", {}).get("next_cursor")
            if not next_cursor:
                break
            params["cursor"] = next_cursor

    async def fetch_works_by_author(self, author_id: str, since: Optional[str] = None) -> AsyncIterator[Dict]:
        """Yield works for a specific author.

        Parameters
        ----------
        author_id: str
            The OpenAlex ID of the author (e.g. ``A123456789``).
        since: Optional[str]
            Optional ISO date (YYYY-MM-DD) for incremental syncs. Works
            updated on or after this date will be returned if supported by the
            API key.
        """
        # Author IDs are provided as full URLs (e.g. https://openalex.org/A123). We
        # extract the last segment if a full URL is passed in.
        if author_id.startswith("http"):
            author_id = author_id.rstrip("/").split("/")[-1]
        filter_param = f"author.id:{author_id}"
        params: Dict[str, str | int | None] = {
            "filter": filter_param,
            "per-page": self._settings.batch_size,
            "cursor": "*",
        }
        if since:
            params["from_updated_date"] = since
        while True:
            data = await self._get("/works", params)
            results = data.get("results", [])
            for item in results:
                yield item
            next_cursor = data.get("meta", {}).get("next_cursor")
            if not next_cursor:
                break
            params["cursor"] = next_cursor