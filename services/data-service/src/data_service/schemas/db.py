"""Pydantic models for normalised database records.

These models preserve all important data from OpenAlex during the cleaning
phase before loading into the production database.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AuthorRecord(BaseModel):
    """Complete author record preserving all OpenAlex data."""
    
    id: str
    name: str
    orcid: Optional[str] = None
    
    # From web scraping
    email: Optional[str] = None
    phone: Optional[str] = None
    dept: Optional[str] = None  # Job title from scraping
    image_url: Optional[str] = None
    is_faculty: bool = False
    
    # From OpenAlex
    works_count: Optional[int] = None
    cited_by_count: Optional[int] = None
    h_index: Optional[int] = None
    i10_index: Optional[int] = None
    two_yr_mean_citedness: Optional[float] = None
    
    # Institution info
    ror_id: Optional[str] = None
    last_known_institution: Optional[str] = None
    last_known_institution_country: Optional[str] = None
    
    # Additional data stored as JSON
    affiliations_json: Optional[str] = None  # Full affiliation history as JSON
    topics_json: Optional[str] = None  # Research topics as JSON
    counts_by_year_json: Optional[str] = None  # Publication/citation counts by year
    openalex_ids_json: Optional[str] = None  # All matched OpenAlex IDs (when merged)
    
    # Dates
    openalex_created_date: Optional[str] = None
    openalex_updated_date: Optional[str] = None


class PublicationRecord(BaseModel):
    """Complete publication record preserving all OpenAlex data."""
    
    id: str
    doi: Optional[str] = None
    title: Optional[str] = None
    abstract: Optional[str] = None
    year: Optional[int] = None
    publication_date: Optional[str] = None
    
    # Type and status
    type: Optional[str] = None  # journal-article, book-chapter, etc.
    type_crossref: Optional[str] = None
    is_oa: Optional[bool] = None
    is_retracted: Optional[bool] = None
    language: Optional[str] = None
    
    # Venue/Source
    venue: Optional[str] = None
    venue_id: Optional[str] = None
    venue_issn: Optional[str] = None
    venue_type: Optional[str] = None
    
    # Biblio
    volume: Optional[str] = None
    issue: Optional[str] = None
    first_page: Optional[str] = None
    last_page: Optional[str] = None
    
    # Metrics
    citations: Optional[int] = None
    
    # URLs
    pdf_url: Optional[str] = None
    landing_page_url: Optional[str] = None
    oa_url: Optional[str] = None
    license: Optional[str] = None
    
    # Topics/Concepts stored as JSON
    primary_topic: Optional[str] = None
    topics_json: Optional[str] = None
    concepts_json: Optional[str] = None
    keywords_json: Optional[str] = None
    
    # Authorships stored as JSON (preserves full coauthor details)
    authorships_json: Optional[str] = None
    author_count: Optional[int] = None
    
    # References
    referenced_works_count: Optional[int] = None
    
    # Counts by year
    counts_by_year_json: Optional[str] = None
    
    # Grants
    grants_json: Optional[str] = None
    
    # Dates
    openalex_created_date: Optional[str] = None
    openalex_updated_date: Optional[str] = None


class TopicRecord(BaseModel):
    """Topic/concept record."""
    name: str
    openalex_id: Optional[str] = None
    level: Optional[int] = None


class AuthorPublicationRecord(BaseModel):
    """Author-publication relationship with authorship details."""
    author_id: str
    publication_id: str
    author_position: Optional[str] = None  # first, middle, last
    is_corresponding: Optional[bool] = None
    raw_affiliation: Optional[str] = None


class PublicationTopicRecord(BaseModel):
    """Publication-topic relationship."""
    publication_id: str
    topic_name: str
    topic_id: Optional[str] = None
    score: Optional[float] = None