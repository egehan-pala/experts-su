"""Data collection functions for the ETL pipeline.

Collectors handle the "extract" phase of the ETL process. They use the
OpenAlex client to fetch authors and works for the configured institution
and write the raw payloads to staging tables. Each run can be incremental:
if a `since` date is provided the collectors only fetch records updated
after that date. After a successful run the latest sync date is stored
in the `etl_state` table.
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import json
from typing import Optional, Tuple, List

from ..config import Settings
from ..clients.openalex import OpenAlexClient
from ..clients.supabase import Database
from ..logging import get_logger
from ..utils.time import iso_now


logger = get_logger(__name__)


async def collect(settings: Settings, db: Database, client: OpenAlexClient, since: Optional[str] = None) -> None:
    """Run the collection phase: fetch authors and works, store in staging tables.

    Parameters
    ----------
    settings: Settings
        Service configuration.
    db: Database
        Connected database client.
    client: OpenAlexClient
        OpenAlex API client.
    since: Optional[str]
        Optional ISO date string (YYYY-MM-DD) representing the lower bound on
        record update dates. If not provided the function will attempt to
        retrieve the last sync date from the ETL state table. When none is
        available the default configured value is used.
    """
    # Determine starting point for incremental sync
    if since is None:
        previous = await db.get_etl_state("collect_since")
        since = previous or settings.since_default
        logger.info({"message": "Using since date from state", "since": since})
    else:
        logger.info({"message": "Using provided since date", "since": since})

    logger.info({"message": "Starting author collection", "since": since})
    await _collect_authors(settings, db, client, since)
    logger.info({"message": "Author collection complete"})

    logger.info({"message": "Starting works collection (all works, no date filter)"})
    await _collect_works(settings, db, client)
    logger.info({"message": "Works collection complete"})

    # Persist new sync date
    await db.set_etl_state("collect_since", iso_now())
    logger.info({"message": "Collection phase complete"})


async def _collect_authors(settings: Settings, db: Database, client: OpenAlexClient, since: Optional[str]) -> None:
    """Fetch authors from OpenAlex and insert into staging."""
    batch: List[dict] = []
    batch_size = settings.batch_size
    async for author in client.fetch_authors_by_ror(since=since):
        batch.append(author)
        if len(batch) >= batch_size:
            await db.insert_staging_authors(batch)
            logger.info({"message": "Inserted author batch", "count": len(batch)})
            batch.clear()
    if batch:
        await db.insert_staging_authors(batch)
        logger.info({"message": "Inserted final author batch", "count": len(batch)})


async def _collect_works(settings: Settings, db: Database, client: OpenAlexClient) -> None:
    """Fetch ALL works for all staged authors and insert into staging.
    
    Uses only author.id filter - no date restrictions. This ensures we get
    the complete publication history for each author, including works from
    before they joined Sabancı University.
    
    IMPORTANT: Only creates author-publication relationships for the specific
    author whose works we're fetching, NOT for all co-authors in each work.
    """
    rows = await db.fetch("SELECT payload FROM stg_authors")
    author_ids = []
    for row in rows:
        payload = row["payload"]
        author = json.loads(payload)
        author_id = author.get("id")
        if author_id:
            author_ids.append(author_id)
    
    # Deduplicate author IDs
    author_ids = list(dict.fromkeys(author_ids))
    # Create a set for fast lookup of valid author IDs
    valid_author_ids = set(author_ids)
    
    logger.info({"message": "Collecting works for authors", "count": len(author_ids)})
    
    batch_size = settings.batch_size
    total_works = 0
    
    for idx, author_id in enumerate(author_ids, 1):
        works_batch: List[dict] = []
        relations: List[tuple[str, str]] = []
        author_works_count = 0
        
        async for work in client.fetch_works_by_author(author_id):
            works_batch.append(work)
            author_works_count += 1
            
            # ONLY create relationship for the specific author we're querying
            # This is the author_id we used to fetch these works
            relations.append((author_id, work.get("id")))
            
            if len(works_batch) >= batch_size:
                await db.insert_staging_publications(works_batch)
                await db.insert_staging_author_publications(relations)
                logger.info({"message": "Inserted works batch", "count": len(works_batch)})
                works_batch.clear()
                relations.clear()
        
        # Insert any remaining works for this author
        if works_batch:
            await db.insert_staging_publications(works_batch)
            await db.insert_staging_author_publications(relations)
        
        total_works += author_works_count
        logger.info({"message": f"Author {idx}/{len(author_ids)}", "author_id": author_id, "works": author_works_count})
    
    logger.info({"message": "Works collection complete", "total_works": total_works})


async def collect_targeted(settings: Settings, db: Database, client: OpenAlexClient) -> None:
    """Run targeted collection using scraped faculty names + bulk name matching.
    
    Flow:
    1. Web scrape faculty names from Sabancı University website
    2. Bulk fetch ALL OpenAlex authors affiliated with the institution
    3. Smart name matching (exact → abbreviation → fuzzy) with disambiguation
    4. Save match map for the cleaner (OA author ID → scraped faculty data)
    5. Insert only matched authors into staging
    6. Fetch ALL works by author ID (no date/institution filter on works)
    """
    from pathlib import Path
    from ..scrapers.faculty import scrape_all_faculty
    from .name_matcher import match_faculty_to_openalex
    
    logger.info("Starting targeted collection (bulk fetch + name matching)...")
    print("\n" + "="*60)
    print("🎯 TARGETED COLLECTION (Bulk Fetch + Name Matching)")
    print("="*60 + "\n")
    
    # Step 1: Web scrape faculty names
    print("📋 Step 1: Scraping faculty names from website...")
    faculty_list = await scrape_all_faculty()
    logger.info(f"Scraped {len(faculty_list)} faculty names.")
    print(f"   ✅ Found {len(faculty_list)} faculty members\n")

    # Step 2: Bulk fetch ALL OpenAlex authors for the institution
    print("🔍 Step 2: Fetching ALL OpenAlex authors for the institution...")
    oa_authors = await client.fetch_all_authors_by_institution()
    print(f"   ✅ Fetched {len(oa_authors)} OpenAlex authors\n")
    logger.info(f"Fetched {len(oa_authors)} OpenAlex authors for institution.")

    # Step 3: Name matching
    print("🧩 Step 3: Matching scraped names to OpenAlex authors...")
    result = match_faculty_to_openalex(faculty_list, oa_authors)
    
    matched = result["matched"]
    unmatched = result["unmatched"]
    ambiguous = result["ambiguous"]
    
    print(f"   ✅ Matched:   {len(matched)}")
    print(f"   ⚠️  Ambiguous: {len(ambiguous)}")
    print(f"   ❌ Unmatched: {len(unmatched)}")
    
    if ambiguous:
        print("\n   Ambiguous cases (multiple candidates):")
        for a in ambiguous:
            name = a["faculty"]["name"]
            ids = ", ".join(c["openalex_id"].split("/")[-1] for c in a["candidates"])
            print(f"     {name} → {ids}")
    
    if unmatched:
        print("\n   Unmatched faculty:")
        for u in unmatched:
            print(f"     {u['name']}")
    print()

    # Step 4: Save match map for the cleaner
    # Maps: OA author ID → scraped faculty data (name, email, phone, image, dept)
    print("💾 Step 4: Saving match map for cleaner enrichment...")
    match_map: dict = {}
    for m in matched:
        oa_id = m.get("openalex_id", "").split("/")[-1]
        if oa_id:
            match_map[oa_id] = {
                "scraped_name": m.get("name", ""),
                "email": m.get("email", ""),
                "phone": m.get("phone", ""),
                "image_url": m.get("image_url", ""),
                "dept": m.get("dept", ""),
            }
    
    match_map_path = Path("data_exports") / "match_map.json"
    match_map_path.parent.mkdir(parents=True, exist_ok=True)
    with open(match_map_path, "w") as f:
        json.dump(match_map, f, indent=2, ensure_ascii=False)
    print(f"   ✅ Saved match map ({len(match_map)} entries) → {match_map_path}\n")
    logger.info(f"Match map saved: {len(match_map)} entries")

    # Step 5: Insert matched authors into staging
    print("📥 Step 5: Inserting matched authors into staging...")
    batch: List[dict] = []
    batch_size = settings.batch_size
    
    for m in matched:
        raw_payload = m.get("_raw")
        if raw_payload:
            batch.append(raw_payload)
            if len(batch) >= batch_size:
                await db.insert_staging_authors(batch)
                batch.clear()
    
    if batch:
        await db.insert_staging_authors(batch)
    
    print(f"   ✅ Inserted {len(matched)} author profiles into staging\n")
    logger.info(f"Author collection complete. Inserted {len(matched)} matches.")
    
    # Step 6: Collect ALL works for each author (by author ID only)
    print("📚 Step 6: Fetching ALL publications by author ID (no date filter)...")
    logger.info("Starting works collection (no date filter)...")
    await _collect_works(settings, db, client)
    
    print("\n" + "="*60)
    print("✨ TARGETED COLLECTION COMPLETE")
    print("="*60 + "\n")