"""Data cleaning and normalisation functions.

This module implements the "transform" stage of the ETL pipeline. It reads
raw payloads from the staging tables, validates them with Pydantic models,
deduplicates authors, extracts ALL fields, and produces normalised records
ready for loading into the production schema.

IMPORTANT: This cleaner preserves all OpenAlex data to avoid information loss.
"""

from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional, Tuple

import unicodedata

from ..clients.supabase import Database
from ..schemas.openalex import OAAuthor, OAWork
from ..schemas.db import (
    AuthorRecord,
    PublicationRecord,
    AuthorPublicationRecord,
    TopicRecord,
    PublicationTopicRecord,
)
from ..scrapers.faculty import scrape_all_faculty
from ..logging import get_logger


logger = get_logger(__name__)


def _normalize_name(name: str) -> str:
    """Normalise a person's name for deduplication."""
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _normalize_name_filter(n: str) -> str:
    """Normalize name for faculty matching."""
    if not n:
        return ""
    return unicodedata.normalize('NFKD', n).encode('ASCII', 'ignore').decode('utf-8').lower().replace(" ", "")


def _safe_json(data: Any) -> Optional[str]:
    """Safely convert data to JSON string."""
    if data is None:
        return None
    try:
        return json.dumps(data, ensure_ascii=False)
    except (TypeError, ValueError):
        return None


async def clean(db: Database, min_year: int = 0) -> Tuple[
    List[Dict[str, Any]],  # authors
    List[Dict[str, Any]],  # publications
    List[Dict[str, str]],  # author_publications
    List[Dict[str, Any]],  # topics
    List[Dict[str, Any]],  # publication_topics
    List[Dict[str, int]],  # metrics per author/year
    List[Dict[str, Any]],  # coauthor edges
]:
    """Clean and deduplicate staged data, preserving all OpenAlex fields."""
    
    # Fetch staged data
    stg_authors = await db.fetch("SELECT payload FROM stg_authors")
    stg_publications = await db.fetch("SELECT payload FROM stg_publications")
    stg_relations = await db.fetch("SELECT payload FROM stg_author_publications")

    # Parse staged authors
    authors: List[OAAuthor] = []
    for row in stg_authors:
        payload = json.loads(row["payload"])
        try:
            author = OAAuthor.model_validate(payload)
            authors.append(author)
        except Exception as exc:
            logger.error({"message": "Invalid author payload", "error": str(exc)})

    # Get faculty data for enrichment
    try:
        scraped_faculty = await scrape_all_faculty()
    except Exception as exc:
        logger.error(f"Failed to scrape faculty: {exc}")
        scraped_faculty = []

    faculty_map = {_normalize_name_filter(f["name"]): f for f in scraped_faculty}
    logger.info({"message": "Faculty scraping results", "count": len(scraped_faculty), "sample": scraped_faculty[:1] if scraped_faculty else []})

    # Process authors - preserve ALL OpenAlex data
    dedup_map: Dict[str, AuthorRecord] = {}
    faculty_matches = 0
    for author in authors:
        n_name = _normalize_name_filter(author.display_name)
        match = faculty_map.get(n_name)
        if match:
             faculty_matches += 1
        
        # If scraping succeeded, enforce the filter
        if scraped_faculty and not match:
            continue

        key = author.id.split("/")[-1]
        
        # Extract summary stats
        h_index = None
        i10_index = None
        two_yr_mean = None
        if author.summary_stats:
            h_index = author.summary_stats.h_index
            i10_index = author.summary_stats.i10_index
            two_yr_mean = author.summary_stats.two_yr_mean_citedness
        
        # Extract institution info
        ror_id = None
        inst_name = None
        inst_country = None
        if author.last_known_institution:
            ror_id = author.last_known_institution.ror
            inst_name = author.last_known_institution.display_name
            inst_country = author.last_known_institution.country_code
        
        # Build complete author record
        rec = AuthorRecord(
            id=key,
            name=author.display_name,
            orcid=author.orcid,
            
            # From scraping
            email=match.get("email") if match else None,
            phone=match.get("phone") if match else None,
            dept=match.get("title") if match else None,
            image_url=match.get("image_url") if match else None,
            is_faculty=True if match else False,
            
            # From OpenAlex
            works_count=author.works_count,
            cited_by_count=author.cited_by_count,
            h_index=h_index,
            i10_index=i10_index,
            two_yr_mean_citedness=two_yr_mean,
            
            # Institution
            ror_id=ror_id,
            last_known_institution=inst_name,
            last_known_institution_country=inst_country,
            
            # JSON fields for complex data
            affiliations_json=_safe_json(author.affiliations) if author.affiliations else None,
            topics_json=_safe_json(author.topics) if author.topics else None,
            counts_by_year_json=_safe_json(author.counts_by_year) if author.counts_by_year else None,
            
            # Dates
            openalex_created_date=author.created_date,
            openalex_updated_date=author.updated_date,
        )
        
        existing = dedup_map.get(key)
        if existing is None:
            dedup_map[key] = rec
        else:
            # We already have this author ID. 
            # If the new record has faculty info (is_faculty=True), we should keep it/merge it.
            # But since we iterate stg_authors first, and they are unique by definition (mostly),
            # simplistic overwrite or ignore is fine. The logic below was based on ORCID merging.
            # Let's just keep the existing one if it's already there to be safe, 
            # OR assume stg_authors iteration order is fine.
            # Actually, we should merge if one has is_faculty=True.
            if rec.is_faculty and not existing.is_faculty:
                 dedup_map[key] = rec

    authors_norm = [rec.model_dump() for rec in dedup_map.values()]

    # Parse works - preserve ALL OpenAlex data
    works: List[OAWork] = []
    for row in stg_publications:
        payload = json.loads(row["payload"])
        try:
            work = OAWork.model_validate(payload)
            
            # Filter by year if specified
            if min_year > 0 and (work.publication_year is None or work.publication_year < min_year):
                continue
            
            # Filter out theses/dissertations
            if work.type in ("dissertation", "thesis", "master thesis"):
                continue

            works.append(work)
        except Exception as exc:
            logger.error({"message": "Invalid work payload", "error": str(exc)})

    # Process publications
    publications_norm: List[Dict[str, Any]] = []
    topics_set: Dict[str, Dict[str, Any]] = {}
    publication_topics_norm: List[Dict[str, Any]] = []
    
    # We will rebuild author_publications from the full authorship data
    # instead of relying on the incomplete stg_author_publications table.
    author_publications_norm: List[Dict[str, Any]] = []
    
    for work in works:
        pub_id = work.id.split("/")[-1]
        
        # Extract venue info
        venue_name = None
        venue_id = None
        venue_issn = None
        venue_type = None
        if work.host_venue:
            venue_name = work.host_venue.get("display_name")
            venue_id = work.host_venue.get("id")
            venue_issn = work.host_venue.get("issn_l")
            venue_type = work.host_venue.get("type")
        
        # Extract biblio
        volume = None
        issue = None
        first_page = None
        last_page = None
        if work.biblio:
            volume = work.biblio.volume
            issue = work.biblio.issue
            first_page = work.biblio.first_page
            last_page = work.biblio.last_page
        
        # Extract OA location info
        pdf_url = None
        landing_url = None
        oa_url = None
        license_info = None
        
        if work.best_oa_location:
            pdf_url = work.best_oa_location.get("pdf_url")
            landing_url = work.best_oa_location.get("landing_page_url")
            oa_url = pdf_url or landing_url
            license_info = work.best_oa_location.get("license")
        elif work.primary_location:
            pdf_url = work.primary_location.get("pdf_url")
            landing_url = work.primary_location.get("landing_page_url")
        
        # Extract primary topic
        primary_topic_name = None
        if work.primary_topic:
            primary_topic_name = work.primary_topic.get("display_name")
        
        # Build authorships JSON preserving all coauthor details
        authorships_data = []
        for authorship in work.authorships:
            # 1. Capture payload for JSON field
            auth_data = {
                "author_id": authorship.author.id,
                "author_name": authorship.author.display_name,
                "author_orcid": authorship.author.orcid,
                "position": authorship.author_position,
                "is_corresponding": authorship.is_corresponding,
                "raw_name": authorship.raw_author_name,
                "countries": authorship.countries,
                "institutions": [
                    {
                        "id": inst.id,
                        "name": inst.display_name,
                        "ror": inst.ror,
                        "country": inst.country_code,
                    }
                    for inst in (authorship.institutions or [])
                ],
                "raw_affiliations": authorship.raw_affiliation_strings,
            }
            authorships_data.append(auth_data)
            
            # 2. Extract Author Record (Internal OR External)
            if not authorship.author or not authorship.author.id:
                continue
            aid_clean = authorship.author.id.split("/")[-1]
            if not aid_clean:
                continue
                
            # If this author is NOT already in our deduplicated map (i.e. not a staged faculty member)
            # we should add them as an "external" author.
            # We use the same AuthorRecord structure but with null department/scraped info.
            if aid_clean not in dedup_map:
                # Create minimal record for external author
                external_rec = AuthorRecord(
                    id=aid_clean,
                    name=authorship.author.display_name,
                    orcid=authorship.author.orcid,
                    # External authors have no internal university info
                    dept=None,
                    email=None,
                    phone=None,
                    image_url=None,
                    is_faculty=False,
                    # We don't have full stats for external authors unless we fetch them individually,
                    # so we leave these as None or 0.
                    works_count=0,
                    cited_by_count=0,
                    h_index=None,
                    i10_index=None,
                    two_yr_mean_citedness=None,
                    ror_id=None,
                    last_known_institution=None,
                    last_known_institution_country=None,
                    affiliations_json=None,
                    topics_json=None,
                    counts_by_year_json=None,
                    openalex_created_date=None,
                    openalex_updated_date=None,
                )
                dedup_map[aid_clean] = external_rec
            
            # 3. Create Author-Publication Relationship
            # This ensures we have a link for every author on the paper
            author_publications_norm.append({
                "author_id": aid_clean,
                "publication_id": pub_id,
            })

        # Build publication record with ALL data
        pub_rec = PublicationRecord(
            id=pub_id,
            doi=work.doi,
            title=work.title or work.display_name,
            abstract=work.abstract,
            year=work.publication_year,
            publication_date=work.publication_date,
            
            # Type and status
            type=work.type,
            type_crossref=work.type_crossref,
            is_oa=work.is_oa,
            is_retracted=work.is_retracted,
            language=work.language,
            
            # Venue
            venue=venue_name,
            venue_id=venue_id,
            venue_issn=venue_issn,
            venue_type=venue_type,
            
            # Biblio
            volume=volume,
            issue=issue,
            first_page=first_page,
            last_page=last_page,
            
            # Metrics
            citations=work.cited_by_count,
            
            # URLs
            pdf_url=pdf_url,
            landing_page_url=landing_url,
            oa_url=oa_url,
            license=license_info,
            
            # Topics/Concepts as JSON
            primary_topic=primary_topic_name,
            topics_json=_safe_json(work.topics) if work.topics else None,
            concepts_json=_safe_json([c.model_dump() for c in work.concepts]) if work.concepts else None,
            keywords_json=_safe_json(work.keywords) if work.keywords else None,
            
            # Authorships as JSON
            authorships_json=_safe_json(authorships_data),
            author_count=len(work.authorships),
            
            # References
            referenced_works_count=len(work.referenced_works) if work.referenced_works else 0,
            
            # Counts by year
            counts_by_year_json=_safe_json(work.counts_by_year) if work.counts_by_year else None,
            
            # Grants
            grants_json=_safe_json(work.grants) if work.grants else None,
            
            # Dates
            openalex_created_date=work.created_date,
            openalex_updated_date=work.updated_date,
        )
        publications_norm.append(pub_rec.model_dump())
        
        # Extract concepts as topics (with full info)
        for concept in work.concepts:
            name = concept.display_name.strip()
            if name:
                topics_set[name] = {
                    "name": name,
                    "openalex_id": concept.id,
                    "level": concept.level,
                }
                publication_topics_norm.append({
                    "publication_id": pub_id,
                    "topic_name": name,
                    "topic_id": concept.id,
                    "score": concept.score,
                })

    topics_norm = list(topics_set.values())

    # Re-generate authors list from the updated dedup_map (now including external authors)
    authors_norm = [rec.model_dump() for rec in dedup_map.values()]
    
    # We no longer need to filter active_author_ids from stg_relations
    # because we built author_publications_norm from the source of truth (works).
    
    # Compute metrics: publications and citations per author per year
    metrics: Dict[Tuple[str, int], Dict[str, int]] = {}
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

    # Co-author edges
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

    logger.info({
        "message": "Cleaning complete",
        "authors": len(authors_norm),
        "publications": len(publications_norm),
        "topics": len(topics_norm),
        "faculty_matches": faculty_matches,
    })

    return (
        authors_norm,
        publications_norm,
        author_publications_norm,
        topics_norm,
        publication_topics_norm,
        metrics_norm,
        coauthor_edges_norm,
    )