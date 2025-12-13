"""Data cleaning and normalisation functions.

This module implements the "transform" stage of the ETL pipeline. It reads
raw payloads from the staging tables, validates them with Pydantic models,
deduplicates authors, extracts relevant fields, and produces normalised
records ready for loading into the production schema.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Dict, Iterable, List, Optional, Tuple

from ..clients.supabase import Database
from ..schemas.openalex import OAAuthor, OAWork
from ..schemas.db import (
    AuthorRecord,
    PublicationRecord,
    AuthorPublicationRecord,
    TopicRecord,
    PublicationTopicRecord,
)
from ..logging import get_logger


logger = get_logger(__name__)


def _normalize_name(name: str) -> str:
    """Normalise a person's name for deduplication.

    Lowercase the name and strip all non‑alphanumeric characters. This
    heuristic is simple but effective for identifying potential duplicates.
    """
    return re.sub(r"[^a-z0-9]", "", name.lower())


async def clean(db: Database, min_year: int = 0) -> Tuple[
    List[Dict[str, Optional[str]]],  # authors
    List[Dict[str, Optional[str | int]]],  # publications
    List[Dict[str, str]],  # author_publications
    List[Dict[str, str]],  # topics
    List[Dict[str, str]],  # publication_topics
    List[Dict[str, int]],  # metrics per author/year
    List[Dict[str, int | str]],  # coauthor edges
]:
    """Clean and deduplicate staged data.

    Parameters
    ----------
    db: Database
        Connected database client.
    min_year: int
        Optional minimum year to include. Authors must have affiliation activity
        in or after this year, and publications must be published in or after
        this year.

    Returns
    -------
    Tuple of lists containing authors, publications, author_publications,
    topics, publication_topics, metrics and coauthor edges.
    """
    # Fetch staged authors and publications
    stg_authors = await db.fetch("SELECT payload FROM stg_authors")
    stg_publications = await db.fetch("SELECT payload FROM stg_publications")
    stg_relations = await db.fetch("SELECT payload FROM stg_author_publications")

    # Parse staged authors into model instances
    authors: List[OAAuthor] = []
    for row in stg_authors:
        payload = json.loads(row["payload"])
        try:
            author = OAAuthor.parse_obj(payload)
            # Filter authors by activity year if min_year is set
            if min_year > 0:
                affiliations = getattr(author, "affiliations", [])
                has_recent = False
                for aff in affiliations:
                    years = aff.get("years", [])
                    if years and any(y >= min_year for y in years):
                        has_recent = True
                        break
                if not has_recent:
                    continue  # Skip author
            authors.append(author)
        except Exception as exc:
            logger.error({"message": "Invalid author payload", "error": str(exc)})

    # Deduplicate authors by ORCID if available, otherwise normalised name
    dedup_map: Dict[str, AuthorRecord] = {}
    for author in authors:
        key = author.orcid or _normalize_name(author.display_name)
        # Extract department and email from last_known_institution if available
        dept = None
        if author.last_known_institution:
            dept = author.last_known_institution.display_name
        # Determine ror id from affiliation
        ror_id = None
        if author.last_known_institution:
            ror_id = author.last_known_institution.ror
        rec = AuthorRecord(
            id=author.id.split("/")[-1],
            orcid=author.orcid,
            name=author.display_name,
            dept=dept,
            email=None,
            ror_id=ror_id,
        )
        existing = dedup_map.get(key)
        if existing is None:
            dedup_map[key] = rec
        else:
            # Prefer the record that has an ORCID or email
            if not existing.orcid and rec.orcid:
                dedup_map[key] = rec
            # Otherwise keep existing

    authors_norm: List[Dict[str, Optional[str]]] = [rec.dict() for rec in dedup_map.values()]

    # Parse works
    works: List[OAWork] = []
    for row in stg_publications:
        payload = json.loads(row["payload"])
        try:
            work = OAWork.parse_obj(payload)
            # Filter publications by year
            if min_year > 0 and (work.publication_year is None or work.publication_year < min_year):
                continue
            works.append(work)
        except Exception as exc:
            logger.error({"message": "Invalid work payload", "error": str(exc)})

    publications_norm: List[Dict[str, Optional[str | int]]] = []
    topics_set: Dict[str, None] = {}
    publication_topics_norm: List[Dict[str, str]] = []
    for work in works:
        pub_id = work.id.split("/")[-1]
        pub_rec = PublicationRecord(
            id=pub_id,
            doi=work.doi,
            title=work.title,
            abstract=work.abstract,
            year=work.publication_year,
            venue=work.host_venue.get("display_name") if work.host_venue else None,
            citations=work.cited_by_count,
        )
        publications_norm.append(pub_rec.dict())
        # Extract concepts as topics
        for concept in work.concepts:
            name = concept.display_name.strip()
            if name:
                topics_set[name] = None
                publication_topics_norm.append({"publication_id": pub_id, "topic_name": name})

    topics_norm = [{"name": name} for name in topics_set.keys()]

    # Author-publication relations
    author_publications_norm: List[Dict[str, str]] = []
    for row in stg_relations:
        payload = json.loads(row["payload"])
        aid = payload.get("author_id")
        wid = payload.get("work_id")
        if aid and wid:
            author_publications_norm.append({"author_id": aid.split("/")[-1], "publication_id": wid.split("/")[-1]})

    # Compute metrics: publications and citations per author per year
    metrics: Dict[Tuple[str, int], Dict[str, int]] = {}
    # Build a mapping of publication id to year and citations
    pub_info = {pub["id"]: (pub.get("year"), pub.get("citations", 0)) for pub in publications_norm}
    for rel in author_publications_norm:
        aid = rel["author_id"]
        pid = rel["publication_id"]
        year, citations = pub_info.get(pid, (None, 0))
        if year is None:
            continue
        key = (aid, year)
        entry = metrics.setdefault(key, {"pub_count": 0, "citations_year": 0})
        entry["pub_count"] += 1
        entry["citations_year"] += citations or 0
    metrics_norm = [
        {"author_id": aid, "year": year, "pub_count": data["pub_count"], "citations_year": data["citations_year"]}
        for (aid, year), data in metrics.items()
    ]

    # Co-author edges: compute counts of shared publications between pairs
    # Build an index of publication_id → list of author_ids
    pub_to_authors: Dict[str, List[str]] = {}
    for rel in author_publications_norm:
        pub_to_authors.setdefault(rel["publication_id"], []).append(rel["author_id"])
    edges_count: Dict[Tuple[str, str], int] = {}
    for authors_list in pub_to_authors.values():
        unique_authors = sorted(set(authors_list))
        for i in range(len(unique_authors)):
            for j in range(i + 1, len(unique_authors)):
                a1, a2 = unique_authors[i], unique_authors[j]
                key = (a1, a2)
                edges_count[key] = edges_count.get(key, 0) + 1
    coauthor_edges_norm = [
        {"author_id": a1, "coauthor_id": a2, "weight": weight}
        for (a1, a2), weight in edges_count.items()
    ]

    return (
        authors_norm,
        publications_norm,
        author_publications_norm,
        topics_norm,
        publication_topics_norm,
        metrics_norm,
        coauthor_edges_norm,
    )