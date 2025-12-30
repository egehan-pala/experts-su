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

    logger.info({"message": "Starting works collection", "since": since})
    await _collect_works(settings, db, client, since)
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


async def _collect_works(settings: Settings, db: Database, client: OpenAlexClient, since: Optional[str]) -> None:
    """Fetch works for all staged authors and insert into staging."""
    # Fetch list of staged authors. We read from the stg_authors table to avoid
    # querying OpenAlex twice for the same author in repeated runs.
    rows = await db.fetch("SELECT payload FROM stg_authors")
    author_ids = []
    for row in rows:
        payload = row["payload"]
        # payload is stored as JSON string
        author = json.loads(payload)
        author_id = author.get("id")
        if author_id:
            author_ids.append(author_id)
    # Deduplicate author IDs
    author_ids = list(dict.fromkeys(author_ids))
    batch_size = settings.batch_size
    for author_id in author_ids:
        works_batch: List[dict] = []
        relations: List[tuple[str, str]] = []
        async for work in client.fetch_works_by_author(author_id, since=since):
            works_batch.append(work)
            # Create author_work relation for each authorship in the work
            for authorship in work.get("authorships", []):
                aid = authorship.get("author", {}).get("id")
                if aid:
                    relations.append((aid, work.get("id")))
            if len(works_batch) >= batch_size:
                await db.insert_staging_publications(works_batch)
                await db.insert_staging_author_publications(relations)
                logger.info({"message": "Inserted works batch", "count": len(works_batch)})
                works_batch.clear()
                relations.clear()
        # Insert any remaining works for this author
        if works_batch:
            await db.insert_staging_author_publications(relations)
            logger.info({"message": "Inserted final works batch", "count": len(works_batch)})


async def collect_targeted(settings: Settings, db: Database, client: OpenAlexClient) -> None:
    """Run targeted collection using scraped faculty names."""
    from ..scrapers.faculty import scrape_all_faculty
    
    logger.info("Starting targeted collection...")
    
    # 1. Scrape names
    faculty_list = await scrape_all_faculty()
    logger.info(f"Scraped {len(faculty_list)} faculty names.")
    print(f"✅ Found {len(faculty_list)} names from website.")

    total_authors_found = 0

    # 2. Search OpenAlex for each name
    batch: List[dict] = []
    
    for faculty in faculty_list:
        name = faculty['name'] 
        # Clean name for search (OpenAlex handles some fuzziness, but cleaner is better)
        # Note: client.fetch_authors_by_names handles filtering by Sabanci ROR
        
        print(f"   Searching for: {name}...", end="", flush=True)
        found_for_name = False
        
        async for author in client.fetch_authors_by_name(name):
            # We trust the client filter (ROR + Name)
            batch.append(author)
            found_for_name = True
            total_authors_found += 1
            
        if found_for_name:
            print(" Found")
        else:
            print(" Not Results")

        if len(batch) >= settings.batch_size:
            await db.insert_staging_authors(batch)
            batch.clear()

    if batch:
        await db.insert_staging_authors(batch)
    
    logger.info(f"Targeted author collection complete. Found {total_authors_found} matches.")
    
    # 3. Collect works for these authors (Re-use existing logic)
    # We pass None for 'since' to fetch full history for these specific people, 
    # or we could respect global since. For targeted, usually we want full history.
    # But to be safe, let's respect the settings default if needed. 
    # Actually, user wants "names and their publications", typically implies all of them.
    # Let's use the default 'since' from settings to avoid fetching ancient history if configured.
    since = settings.since_default
    logger.info("Starting works collection for targeted authors...")
    await _collect_works(settings, db, client, since)