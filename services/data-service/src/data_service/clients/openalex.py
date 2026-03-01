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
            Optional ISO date (YYYY-MM-DD). Note: This parameter is only honoured
            with a premium API key. Without premium access, all authors will be
            returned regardless of this parameter.
        """
        filter_param = f"affiliations.institution.ror:{self._ror_id}"
        params: Dict[str, str | int | None] = {
            "filter": filter_param,
            "per-page": self._settings.batch_size,
            "cursor": "*",
        }
        # Note: from_updated_date is a premium feature and will be ignored
        # without a premium API key. For now, we fetch all authors.
        # To use incremental syncs, you would need a premium OpenAlex API key.
        while True:
            data = await self._get("/authors", params)
            results = data.get("results", [])
            for item in results:
                yield item
            next_cursor = data.get("meta", {}).get("next_cursor")
            if not next_cursor:
                break
            params["cursor"] = next_cursor

    async def fetch_works_by_author(self, author_id: str) -> AsyncIterator[Dict]:
        """Yield ALL works for a specific author.

        Fetches the complete publication history using only the author's unique
        OpenAlex ID. No date or institution filters are applied - this ensures
        we get all publications including those from before the author joined
        the configured institution.

        Parameters
        ----------
        author_id: str
            The OpenAlex ID of the author (e.g. ``A123456789`` or full URL).
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
        while True:
            data = await self._get("/works", params)
            results = data.get("results", [])
            for item in results:
                yield item
            next_cursor = data.get("meta", {}).get("next_cursor")
            if not next_cursor:
                break
            params["cursor"] = next_cursor

    async def fetch_authors_by_name(self, name: str) -> AsyncIterator[Dict]:
        """Yield authors matching a specific name within the institution.
        
        Parameters
        ----------
        name: str
            Name to search for (e.g. "Hüsnü Yenigün").
        """
        filter_param = f"affiliations.institution.ror:{self._ror_id}"
        params: Dict[str, str | int | None] = {
            "filter": filter_param,
            "search": name,
            "per-page": self._settings.batch_size,
            "cursor": "*",
        }
        while True:
            data = await self._get("/authors", params)
            results = data.get("results", [])
            for item in results:
                yield item
            next_cursor = data.get("meta", {}).get("next_cursor")
            if not next_cursor:
                break
            params["cursor"] = next_cursor

    async def fetch_all_authors_by_institution(self) -> list[Dict]:
        """Fetch ALL authors affiliated with the configured institution.

        Unlike ``fetch_authors_by_ror`` (which yields lazily), this method
        collects every author into a list so it can be passed to the name
        matcher for bulk comparison.

        Uses ``affiliations.institution.ror`` so that authors whose
        ``last_known_institutions`` is empty but who *have* published under
        the institution are still included.
        """
        filter_param = f"affiliations.institution.ror:{self._ror_id}"
        params: Dict[str, str | int | None] = {
            "filter": filter_param,
            "per-page": 200,
            "cursor": "*",
        }
        all_authors: list[Dict] = []
        while True:
            data = await self._get("/authors", params)
            results = data.get("results", [])
            if not results:
                break
            all_authors.extend(results)
            next_cursor = data.get("meta", {}).get("next_cursor")
            if not next_cursor:
                break
            params["cursor"] = next_cursor
        return all_authors