"""Pydantic models for the unified search API.

Defines the contract for SearchRequest/SearchResponse used by the
unified POST /search endpoint.
"""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ── Request ──────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    """Unified search request."""
    query: str = Field(..., min_length=2, description="Search query text")
    limit: int = Field(10, ge=1, le=50, description="Max results per category")
    filters: Optional[dict] = Field(
        None, description="Optional filters, e.g. {'department': 'FENS'}"
    )
    debug: bool = Field(False, description="Include debug scores in response")


# ── Result items ─────────────────────────────────────────────────

class MatchSnippet(BaseModel):
    """A matching chunk from a publication or profile."""
    publication_title: Optional[str] = None
    snippet: str
    year: Optional[int] = None
    similarity: float


class PersonResult(BaseModel):
    """Faculty card returned for person-intent queries."""
    id: str
    name: str
    dept: Optional[str] = None
    email: Optional[str] = None
    image_url: Optional[str] = None
    phone: Optional[str] = None
    score: float = Field(description="Match quality score 0-1")
    match_type: str = Field(description="exact | prefix | fuzzy | alias")


class TopicResult(BaseModel):
    """Faculty card returned for topic-intent queries."""
    id: str
    name: str
    dept: Optional[str] = None
    image_url: Optional[str] = None
    email: Optional[str] = None
    similarity: float = Field(description="Aggregate semantic similarity 0-1")
    explanation: List[MatchSnippet] = Field(
        default_factory=list,
        description="Top matching chunks with snippets",
    )


# ── Response ─────────────────────────────────────────────────────

class SearchResponse(BaseModel):
    """Unified search response."""
    intent: Literal["PERSON", "TOPIC", "MIXED"]
    person_results: List[PersonResult] = Field(default_factory=list)
    topic_results: List[TopicResult] = Field(default_factory=list)
    debug: Optional[dict] = Field(
        None, description="Scores and thresholds (only when debug=true)"
    )
