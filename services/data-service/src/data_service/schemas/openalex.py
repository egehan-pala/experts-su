"""Pydantic models representing fields from OpenAlex entities.

These models capture the complete data returned by OpenAlex API to ensure
no information is lost during the ETL pipeline.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class OAAffiliation(BaseModel):
    """Representation of an author's affiliation/institution."""

    id: Optional[str] = None
    ror: Optional[str] = None
    display_name: Optional[str] = None
    country_code: Optional[str] = None
    type: Optional[str] = None


class OASummaryStats(BaseModel):
    """Author summary statistics."""
    
    h_index: Optional[int] = None
    i10_index: Optional[int] = None
    two_yr_mean_citedness: Optional[float] = Field(None, alias="2yr_mean_citedness")

    class Config:
        populate_by_name = True


class OAAuthor(BaseModel):
    """Representation of an author from OpenAlex."""

    id: str = Field(..., description="Canonical OpenAlex identifier")
    orcid: Optional[str] = Field(None, description="ORCID identifier if available")
    display_name: str = Field(..., description="The author's preferred display name")
    display_name_alternatives: List[str] = Field(default_factory=list)
    works_count: Optional[int] = Field(None, description="Number of works")
    cited_by_count: Optional[int] = Field(None, description="Total citations")
    summary_stats: Optional[OASummaryStats] = None
    last_known_institution: Optional[OAAffiliation] = None
    last_known_institutions: Optional[List[OAAffiliation]] = None
    affiliations: List[Dict[str, Any]] = Field(default_factory=list)
    topics: List[Dict[str, Any]] = Field(default_factory=list)
    x_concepts: List[Dict[str, Any]] = Field(default_factory=list)
    counts_by_year: List[Dict[str, Any]] = Field(default_factory=list)
    created_date: Optional[str] = None
    updated_date: Optional[str] = None


class OAConcept(BaseModel):
    """Representation of a concept/keyword associated with a work."""

    id: str
    wikidata: Optional[str] = None
    display_name: str
    level: Optional[int] = None
    score: Optional[float] = None


class OAAuthorshipAuthor(BaseModel):
    """Minimal author info within an authorship record."""
    
    id: Optional[str] = None
    orcid: Optional[str] = None
    display_name: Optional[str] = None


class OAAuthorship(BaseModel):
    """Representation of an authorship record on a work."""

    author: OAAuthorshipAuthor
    institutions: List[OAAffiliation] = Field(default_factory=list)
    countries: List[str] = Field(default_factory=list)
    author_position: Optional[str] = None
    is_corresponding: Optional[bool] = None
    raw_author_name: Optional[str] = None
    raw_affiliation_strings: List[str] = Field(default_factory=list)


class OALocation(BaseModel):
    """Representation of a publication location."""
    
    is_oa: Optional[bool] = None
    landing_page_url: Optional[str] = None
    pdf_url: Optional[str] = None
    source: Optional[Dict[str, Any]] = None
    license: Optional[str] = None
    version: Optional[str] = None


class OABiblio(BaseModel):
    """Bibliographic information."""
    
    volume: Optional[str] = None
    issue: Optional[str] = None
    first_page: Optional[str] = None
    last_page: Optional[str] = None


class OAWork(BaseModel):
    """Representation of a work (publication) from OpenAlex."""

    id: str
    doi: Optional[str] = None
    title: Optional[str] = None
    display_name: Optional[str] = None
    abstract: Optional[str] = None
    abstract_inverted_index: Optional[Dict[str, Any]] = None
    publication_year: Optional[int] = None
    publication_date: Optional[str] = None
    type: Optional[str] = None
    type_crossref: Optional[str] = None
    cited_by_count: Optional[int] = None
    is_oa: Optional[bool] = None
    is_retracted: Optional[bool] = None
    is_paratext: Optional[bool] = None
    language: Optional[str] = None
    
    # Locations
    best_oa_location: Optional[Dict[str, Any]] = None
    primary_location: Optional[Dict[str, Any]] = None
    locations: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Venue/Source
    host_venue: Optional[Dict[str, Any]] = None
    primary_topic: Optional[Dict[str, Any]] = None
    topics: List[Dict[str, Any]] = Field(default_factory=list)
    sustainable_development_goals: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Authorship
    authorships: List[OAAuthorship] = Field(default_factory=list)
    
    # Concepts/Keywords
    concepts: List[OAConcept] = Field(default_factory=list)
    keywords: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Biblio
    biblio: Optional[OABiblio] = None
    
    # References
    referenced_works: List[str] = Field(default_factory=list)
    related_works: List[str] = Field(default_factory=list)
    cited_by_api_url: Optional[str] = None
    
    # Counts
    counts_by_year: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Grants
    grants: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Dates
    created_date: Optional[str] = None
    updated_date: Optional[str] = None