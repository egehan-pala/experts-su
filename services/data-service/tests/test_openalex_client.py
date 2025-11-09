"""Tests for the OpenAlexClient.

These tests mock the underlying HTTP client to ensure that the client
handles pagination and parsing correctly without making network calls.
"""

import asyncio
import os
import sys
import pytest

import httpx

# Ensure the src directory is on the Python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from data_service.clients.openalex import OpenAlexClient
from data_service.config import Settings


class MockTransport(httpx.AsyncBaseTransport):
    """Mock httpx transport that returns predefined responses based on the request URL."""

    def __init__(self, responses):
        self.responses = responses
        self.calls = []

    async def handle_async_request(self, request):  # type: ignore[override]
        self.calls.append(request.url)
        url = str(request.url)
        # Look up the first response whose path is a prefix of the URL
        for prefix, response_data in self.responses.items():
            if url.startswith(prefix):
                status_code, json_data = response_data.pop(0)
                return httpx.Response(status_code=status_code, json=json_data)
        return httpx.Response(status_code=404, json={})


@pytest.mark.asyncio
async def test_fetch_authors_pagination():
    # Prepare mock responses for two pages
    responses = {
        "https://api.openalex.org/authors": [
            (200, {"results": [{"id": "A1", "display_name": "Alice"}], "meta": {"next_cursor": "c2"}}),
            (200, {"results": [{"id": "A2", "display_name": "Bob"}], "meta": {"next_cursor": None}}),
        ]
    }
    transport = MockTransport(responses)
    async_client = httpx.AsyncClient(transport=transport)
    settings = Settings(
        openalex_base_url="https://api.openalex.org",
        openalex_ror_id="01test",
        db_host="localhost",
        db_name="test",
        db_user="test",
        db_password="test",
    )
    client = OpenAlexClient(settings, http_client=async_client)
    results = []
    async for item in client.fetch_authors_by_ror():
        results.append(item["id"])
    await client.close()
    assert results == ["A1", "A2"]
