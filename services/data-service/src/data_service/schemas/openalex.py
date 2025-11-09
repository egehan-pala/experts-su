"""Pydantic models representing selected fields from OpenAlex entities.

Only a subset of fields are modelled here since the ETL pipeline only needs
basic identification, metadata and relational information. Using Pydantic
models makes it explicit which fields we depend on and provides runtime
validation during cleaning.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class OAAffiliation(BaseModel):
    """Representation of an author's last known affiliation."""

    id: Optional[str] = None
    ror: Optional[str] = None
    display_name: Optional[str] = None
    country_code: Optional[str] = None


class OAAuthor(BaseModel):
    """Representation of an author from OpenAlex."""

    id: str = Field(..., description="Canonical OpenAlex identifier, e.g. 'https://openalex.org/A123'")
    orcid: Optional[str] = Field(None, description="ORCID identifier if available")
    display_name: str = Field(..., description="The author's preferred display name")
    works_count: Optional[int] = Field(None, description="Number of works associated with the author")
    cited_by_count: Optional[int] = Field(None, description="Number of citations across all works")
    last_known_institution: Optional[OAAffiliation] = Field(
        None, description="Affiliation extracted by OpenAlex if available"
    )


class OAConcept(BaseModel):
    """Representation of a concept/keyword associated with a work."""

    id: str
    wikidata: Optional[str] = None
    display_name: str
    level: Optional[int] = None
    score: Optional[float] = None


class OAAuthorship(BaseModel):
    """Representation of an authorship record on a work."""

    author: OAAuthor
    institutions: List[OAAffiliation] | None = None
    author_position: Optional[str] = None


class OAWork(BaseModel):
    """Representation of a work (publication) from OpenAlex."""

    id: str
    doi: Optional[str] = None
    title: Optional[str] = None
    abstract: Optional[str] = None
    publication_year: Optional[int] = None
    cited_by_count: Optional[int] = None
    host_venue: Optional[Dict[str, Any]] = None
    authorships: List[OAAuthorship] = []
    concepts: List[OAConcept] = []