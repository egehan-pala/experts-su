"""Pydantic models for normalised database records.

These models are used during the cleaning phase to validate and shape
records before loading them into the production database. Only the fields
required by the service are included here. Additional attributes can be
added as needed.
"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class AuthorRecord(BaseModel):
    id: str
    name: str
    orcid: Optional[str] = None
    dept: Optional[str] = None
    email: Optional[str] = None
    ror_id: Optional[str] = None
    image_url: Optional[str] = None


class PublicationRecord(BaseModel):
    id: str
    doi: Optional[str] = None
    title: Optional[str] = None
    abstract: Optional[str] = None
    year: Optional[int] = None
    venue: Optional[str] = None
    citations: Optional[int] = None


class TopicRecord(BaseModel):
    name: str


class AuthorPublicationRecord(BaseModel):
    author_id: str
    publication_id: str


class PublicationTopicRecord(BaseModel):
    publication_id: str
    topic_name: str