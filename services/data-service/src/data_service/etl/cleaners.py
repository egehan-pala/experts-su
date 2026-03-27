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
from typing import Any, Dict, List, Optional, Set, Tuple

import unicodedata

from ..config import get_settings

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


def _is_false_positive_work(
    work: "OAWork",
    owner_orcid: Optional[str],
    owner_oa_ids: Set[str],
    institution_ror: str,
) -> bool:
    """Check whether a publication is likely a false positive for the owner author.

    A work is considered a false positive when none of the following
    confirmation signals are present in the authorship list:

    1. **Author-ID match** — a co-author's OpenAlex ID matches one of the
       owner's known IDs (primary or merged).
    2. **ORCID match** — the owner has an ORCID and a co-author shares it.
    3. **Affiliation match** — at least one co-author is affiliated with the
       target institution (checked via ROR or raw affiliation string).

    Returns True if the work should be considered a false positive.
    """
    sabanci_keywords = {"sabanci", "sabancı", "sabanciuniv"}

    has_author_id_match = False
    has_orcid_match = False
    has_affiliation_match = False

    for authorship in work.authorships:
        # Check 1: Author OpenAlex ID match
        if authorship.author and authorship.author.id:
            aid = authorship.author.id.split("/")[-1]
            if aid in owner_oa_ids:
                has_author_id_match = True
                # Also check ORCID while we're here
                if owner_orcid and authorship.author.orcid:
                    auth_orcid = authorship.author.orcid.rstrip("/").split("/")[-1]
                    owner_orcid_clean = owner_orcid.rstrip("/").split("/")[-1]
                    if auth_orcid == owner_orcid_clean:
                        has_orcid_match = True

        # Check 2: ORCID match (on any co-author)
        if owner_orcid and authorship.author and authorship.author.orcid:
            auth_orcid = authorship.author.orcid.rstrip("/").split("/")[-1]
            owner_orcid_clean = owner_orcid.rstrip("/").split("/")[-1]
            if auth_orcid == owner_orcid_clean:
                has_orcid_match = True

        # Check 3: Affiliation match (institution ROR or string)
        for inst in (authorship.institutions or []):
            if inst.ror and institution_ror in inst.ror:
                has_affiliation_match = True
                break
            if inst.display_name:
                name_lower = inst.display_name.lower()
                if any(kw in name_lower for kw in sabanci_keywords):
                    has_affiliation_match = True
                    break
        for raw_aff in (authorship.raw_affiliation_strings or []):
            raw_lower = raw_aff.lower()
            if any(kw in raw_lower for kw in sabanci_keywords):
                has_affiliation_match = True
                break

    # If the author's own OpenAlex ID appears in the authorship list, we trust it.
    # The extra ORCID/affiliation checks catch edge cases where the ID was
    # incorrectly merged upstream.
    if has_author_id_match:
        # If owner has an ORCID but it doesn't appear on the matching
        # authorship entry AND no Sabancı affiliation is present, this may
        # be a name-collision merge in OpenAlex.  Flag it.
        if owner_orcid and not has_orcid_match and not has_affiliation_match:
            return True
        return False

    # No author-ID match at all — only keep if ORCID or affiliation confirms
    if has_orcid_match:
        return False
    if has_affiliation_match:
        return False

    # No confirming signal found
    return True


async def clean(db: Database) -> Tuple[
    List[Dict[str, Any]],  # authors
    List[Dict[str, Any]],  # publications
    List[Dict[str, str]],  # author_publications
    List[Dict[str, Any]],  # topics
    List[Dict[str, Any]],  # publication_topics
    List[Dict[str, int]],  # metrics per author/year (old aggregated)
    List[Dict[str, Any]],  # coauthor edges
    List[Dict[str, Any]],  # author_citations_yearly (new structured)
    List[Dict[str, Any]],  # publication_citations_yearly (new structured)
]:
    """Clean and deduplicate staged data, preserving all OpenAlex fields."""
    from pathlib import Path
    from collections import defaultdict
    
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

    # Load match map from collector (OA author ID → scraped faculty data)
    match_map: Dict[str, dict] = {}
    match_map_path = Path("data_exports") / "match_map.json"
    if match_map_path.exists():
        with open(match_map_path, "r") as f:
            match_map = json.load(f)
        logger.info({"message": "Loaded match map", "count": len(match_map)})
    else:
        logger.warning("No match_map.json found — enrichment will be limited")

    # Group authors by scraped faculty name for merging
    # scraped_name → list of (OAAuthor, match_info)
    faculty_groups: Dict[str, list] = defaultdict(list)
    unmatched_authors: list = []
    
    for author in authors:
        key = author.id.split("/")[-1]
        match_info = match_map.get(key)
        if match_info:
            scraped_name = match_info["scraped_name"]
            faculty_groups[scraped_name].append((author, match_info))
        else:
            unmatched_authors.append(author)

    logger.info({
        "message": "Author grouping",
        "faculty_groups": len(faculty_groups),
        "unmatched": len(unmatched_authors),
    })

    # NEW: Structured metrics for authors
    author_citations_norm: List[Dict[str, Any]] = []

    # Merge authors that map to the same scraped faculty name
    dedup_map: Dict[str, AuthorRecord] = {}
    # Track OA ID → primary ID remap for author_publications
    id_remap: Dict[str, str] = {}
    
    for scraped_name, group in faculty_groups.items():
        # Sort by works_count descending; the one with most works is the primary
        group.sort(key=lambda x: x[0].works_count or 0, reverse=True)
        primary_author, primary_match = group[0]
        
        # Collect all OA IDs in this group
        all_oa_ids = [a.id.split("/")[-1] for a, _ in group]
        primary_key = all_oa_ids[0]
        
        # Build the ID remap: all secondary IDs → primary ID
        for oa_id in all_oa_ids:
            id_remap[oa_id] = primary_key
        
        # Aggregate stats across all authors in the group
        total_works = sum(a.works_count or 0 for a, _ in group)
        total_citations = sum(a.cited_by_count or 0 for a, _ in group)
        max_h_index = max((
            (a.summary_stats.h_index if a.summary_stats else None) or 0
            for a, _ in group
        ), default=None)
        max_i10 = max((
            (a.summary_stats.i10_index if a.summary_stats else None) or 0
            for a, _ in group
        ), default=None)
        
        # Use primary author for non-aggregated fields
        h_index = None
        i10_index = None
        two_yr_mean = None
        if primary_author.summary_stats:
            two_yr_mean = primary_author.summary_stats.two_yr_mean_citedness
        
        ror_id = None
        inst_name = None
        inst_country = None
        if primary_author.last_known_institution:
            ror_id = primary_author.last_known_institution.ror
            inst_name = primary_author.last_known_institution.display_name
            inst_country = primary_author.last_known_institution.country_code
        
        rec = AuthorRecord(
            id=primary_key,
            name=scraped_name,  # Use the canonical scraped name
            orcid=primary_author.orcid,
            
            # From scraping via match map
            email=primary_match.get("email") or None,
            phone=primary_match.get("phone") or None,
            dept=primary_match.get("dept") or None,
            image_url=primary_match.get("image_url") or None,
            is_faculty=True,
            
            # Aggregated stats
            works_count=total_works,
            cited_by_count=total_citations,
            h_index=max_h_index,
            i10_index=max_i10,
            two_yr_mean_citedness=two_yr_mean,
            
            # Institution
            ror_id=ror_id,
            last_known_institution=inst_name,
            last_known_institution_country=inst_country,
            
            # JSON fields from primary author
            affiliations_json=_safe_json(primary_author.affiliations) if primary_author.affiliations else None,
            topics_json=_safe_json(primary_author.topics) if primary_author.topics else None,
            counts_by_year_json=_safe_json(primary_author.counts_by_year) if primary_author.counts_by_year else None,
            openalex_ids_json=json.dumps(all_oa_ids) if len(all_oa_ids) > 1 else None,
            
            # Dates
            openalex_created_date=primary_author.created_date,
            openalex_updated_date=primary_author.updated_date,
        )
        dedup_map[primary_key] = rec
        
        # NEW: Extract structured citation metrics for author
        # We handle merging by summing counts for the same year across merged authors
        merged_counts: Dict[int, int] = {}
        for a, _ in group:
            if a.counts_by_year:
                for entry in a.counts_by_year:
                    yr = entry["year"]
                    cnt = entry["cited_by_count"]
                    merged_counts[yr] = merged_counts.get(yr, 0) + cnt
        
        for yr, cnt in merged_counts.items():
            author_citations_norm.append({
                "author_id": primary_key,
                "year": yr,
                "count": cnt
            })
        
        if len(all_oa_ids) > 1:
            logger.info({
                "message": "Merged author",
                "name": scraped_name,
                "primary_id": primary_key,
                "merged_ids": all_oa_ids,
            })

    authors_norm = [rec.model_dump() for rec in dedup_map.values()]
    logger.info({
        "message": "Cleaning complete (authors)",
        "faculty_authors": len(authors_norm),
        "multi_id_merges": sum(1 for r in dedup_map.values() if r.openalex_ids_json is not None),
    })

    # Build lookup structures for false-positive detection
    # owner_orcid_map: primary_author_id → ORCID (if available)
    owner_orcid_map: Dict[str, Optional[str]] = {}
    # owner_all_ids_map: primary_author_id → set of all known OA IDs (including merged)
    owner_all_ids_map: Dict[str, Set[str]] = {}
    for rec in dedup_map.values():
        owner_orcid_map[rec.id] = rec.orcid
        ids = {rec.id}
        if rec.openalex_ids_json:
            try:
                ids.update(json.loads(rec.openalex_ids_json))
            except (json.JSONDecodeError, TypeError):
                pass
        owner_all_ids_map[rec.id] = ids

    # Build work→owner mapping from staging relations
    # A work can be owned by multiple faculty authors (co-authored by two SU profs)
    work_owner_map: Dict[str, Set[str]] = {}
    for row in stg_relations:
        rel = json.loads(row["payload"])
        oa_author_id = rel["author_id"].split("/")[-1]
        work_id = rel["work_id"].split("/")[-1]
        # Remap to primary ID
        primary_id = id_remap.get(oa_author_id, oa_author_id)
        if primary_id in dedup_map:
            work_owner_map.setdefault(work_id, set()).add(primary_id)

    # Parse works — apply quality filters (safety net for API-level filtering)
    settings = get_settings()
    institution_ror = settings.openalex_ror_id
    allowed_types: Set[str] = set(settings.openalex_work_types)
    works: List[OAWork] = []
    skipped_paratext = 0
    skipped_retracted = 0
    skipped_type = 0
    skipped_false_positive = 0
    for row in stg_publications:
        payload = json.loads(row["payload"])
        try:
            work = OAWork.model_validate(payload)
            # Skip paratext (TOC, editorials, covers)
            if getattr(work, 'is_paratext', False):
                skipped_paratext += 1
                continue
            # Skip retracted works
            if getattr(work, 'is_retracted', False):
                skipped_retracted += 1
                continue
            # Skip non-research types
            if allowed_types and work.type and work.type not in allowed_types:
                skipped_type += 1
                continue
            # False-positive detection: verify the owner author is truly on this paper
            work_short_id = work.id.split("/")[-1]
            owners = work_owner_map.get(work_short_id, set())
            if owners:
                # Check each owner — the work is legit if ANY owner passes
                is_fp_for_all = True
                for owner_id in owners:
                    orcid = owner_orcid_map.get(owner_id)
                    all_ids = owner_all_ids_map.get(owner_id, {owner_id})
                    if not _is_false_positive_work(work, orcid, all_ids, institution_ror):
                        is_fp_for_all = False
                        break
                if is_fp_for_all:
                    skipped_false_positive += 1
                    logger.debug({
                        "message": "Skipped false-positive work",
                        "work_id": work_short_id,
                        "title": work.title,
                        "owners": list(owners),
                    })
                    continue
            works.append(work)
        except Exception as exc:
            logger.error({"message": "Invalid work payload", "error": str(exc)})
    
    logger.info({
        "message": "Works filtering complete",
        "accepted": len(works),
        "skipped_paratext": skipped_paratext,
        "skipped_retracted": skipped_retracted,
        "skipped_type": skipped_type,
        "skipped_false_positive": skipped_false_positive,
    })

    # Process publications
    publications_norm: List[Dict[str, Any]] = []
    topics_set: Dict[str, Dict[str, Any]] = {}
    publication_topics_norm: List[Dict[str, Any]] = []
    # NEW: Structured metrics for publications
    publication_citations_norm: List[Dict[str, Any]] = []
    
    # We will rebuild author_publications from the full authorship data
    # instead of relying on the incomplete stg_author_publications table.
    author_publications_norm: List[Dict[str, Any]] = []
    
    for work in works:
        pub_id = work.id.split("/")[-1]
        
        # Extract venue info (host_venue is deprecated, fall back to primary_location.source)
        venue_name = None
        venue_id = None
        venue_issn = None
        venue_type = None
        if work.host_venue:
            venue_name = work.host_venue.get("display_name")
            venue_id = work.host_venue.get("id")
            venue_issn = work.host_venue.get("issn_l")
            venue_type = work.host_venue.get("type")
        if not venue_name and work.primary_location:
            source = work.primary_location.get("source") or {}
            venue_name = source.get("display_name")
            venue_id = venue_id or source.get("id")
            venue_issn = venue_issn or source.get("issn_l")
            venue_type = venue_type or source.get("type")
        
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
            
            # Remap merged author IDs to primary ID
            aid_clean = id_remap.get(aid_clean, aid_clean)
                
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
            sdgs_json=_safe_json(work.sustainable_development_goals) if work.sustainable_development_goals else None,
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
        
        # NEW: Extract structured citation metrics for publication
        if work.counts_by_year:
            for entry in work.counts_by_year:
                publication_citations_norm.append({
                    "publication_id": pub_id,
                    "year": entry["year"],
                    "count": entry["cited_by_count"]
                })
            
        # Re-extract concepts as topics (with Precision Improvement)
        # Threshold at 0.5 to filter out noisy topic assignments as requested
        TOPIC_THRESHOLD = 0.5
        for concept in work.concepts:
            if concept.score < TOPIC_THRESHOLD:
                continue
                
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
    pub_info = {
        pub["id"]: {
            "year": pub.get("year"),
            "citations": pub.get("citations", 0),
            "counts_by_year": json.loads(pub.get("counts_by_year_json") or "[]")
        } 
        for pub in publications_norm
    }
    
    for rel in author_publications_norm:
        aid = rel["author_id"]
        pid = rel["publication_id"]
        info = pub_info.get(pid)
        if not info:
            continue
            
        pub_year = info["year"]
        if pub_year is not None:
            key = (aid, pub_year)
            entry = metrics.setdefault(key, {"pub_count": 0, "citations_year": 0})
            entry["pub_count"] += 1

        counts_by_year = info["counts_by_year"]
        if counts_by_year:
            for c_entry in counts_by_year:
                c_year = c_entry.get("year")
                c_count = c_entry.get("cited_by_count", 0)
                if c_year:
                    key = (aid, c_year)
                    entry = metrics.setdefault(key, {"pub_count": 0, "citations_year": 0})
                    entry["citations_year"] += c_count
        elif pub_year:
            key = (aid, pub_year)
            entry = metrics.setdefault(key, {"pub_count": 0, "citations_year": 0})
            entry["citations_year"] += info["citations"]
    
    metrics_norm = [
        {"author_id": aid, "year": year, "pub_count": data["pub_count"], "citations_year": data["citations_year"]}
        for (aid, year), data in metrics.items()
    ]

    # Co-author edges (with hyper-authorship cap — Rankless-style)
    max_coauthor_cap = settings.max_authors_per_work
    pub_to_authors: Dict[str, List[str]] = {}
    for rel in author_publications_norm:
        pub_to_authors.setdefault(rel["publication_id"], []).append(rel["author_id"])
    
    edges_count: Dict[Tuple[str, str], int] = {}
    skipped_hyperauthor = 0
    for authors_list in pub_to_authors.values():
        unique_authors = sorted(set(authors_list))
        # Skip hyper-authored papers to prevent clique distortion in the network
        if len(unique_authors) > max_coauthor_cap:
            skipped_hyperauthor += 1
            continue
        for i in range(len(unique_authors)):
            for j in range(i + 1, len(unique_authors)):
                a1, a2 = unique_authors[i], unique_authors[j]
                key = (a1, a2)
                edges_count[key] = edges_count.get(key, 0) + 1
    
    if skipped_hyperauthor > 0:
        logger.info({
            "message": "Skipped hyper-authored papers for co-authorship graph",
            "skipped": skipped_hyperauthor,
            "cap": max_coauthor_cap,
        })
    
    coauthor_edges_norm = [
        {"author_id": a1, "coauthor_id": a2, "weight": weight}
        for (a1, a2), weight in edges_count.items()
    ]

    logger.info({
        "message": "Cleaning complete",
        "authors": len(authors_norm),
        "publications": len(publications_norm),
        "topics": len(topics_norm),
        "faculty_groups": len(faculty_groups),
    })

    return (
        authors_norm,
        publications_norm,
        author_publications_norm,
        topics_norm,
        publication_topics_norm,
        metrics_norm,
        coauthor_edges_norm,
        author_citations_norm,
        publication_citations_norm,
    )