"""Data loading functions for the ETL pipeline.

This module implements the "load" stage of the ETL process. Given
normalised lists of entities produced by the cleaning stage it upserts
records into the production tables, creates missing topics, and populates
relation tables. Metrics and co-author edges are also loaded. Materialised
views can optionally be refreshed after loading.
"""

from __future__ import annotations

from typing import Dict, Iterable, List

from ..clients.supabase import Database
from ..logging import get_logger


logger = get_logger(__name__)


async def load(
    db: Database,
    authors: List[Dict],
    publications: List[Dict],
    author_publications: List[Dict],
    topics: List[Dict],
    publication_topics: List[Dict],
    metrics: List[Dict],
    coauthor_edges: List[Dict],
) -> None:
    """Upsert all normalised entities into the database.

    The order of operations is important: authors and publications must be
    inserted before their relation tables. Topics must be inserted before
    publication_topics so that we can obtain topic IDs. Metrics and network
    edges can be inserted last.
    """
    # Authors
    await db.upsert_authors(authors)
    logger.info({"message": "Upserted authors", "count": len(authors)})

    # Publications
    await db.upsert_publications(publications)
    logger.info({"message": "Upserted publications", "count": len(publications)})

    # Author-publication relations
    await db.upsert_author_publications(author_publications)
    logger.info({"message": "Upserted author_publications", "count": len(author_publications)})

    # Topics: insert names and fetch their IDs
    name_to_id = await db.upsert_topics(topics)
    logger.info({"message": "Upserted topics", "count": len(name_to_id)})

    # Replace topic names with IDs for publication_topics
    pub_topic_records = []
    for rel in publication_topics:
        topic_name = rel["topic_name"]
        topic_id = name_to_id.get(topic_name)
        if topic_id:
            pub_topic_records.append(
                {"publication_id": rel["publication_id"], "topic_id": topic_id}
            )
    await db.upsert_publication_topics(pub_topic_records)
    logger.info({"message": "Upserted publication_topics", "count": len(pub_topic_records)})

    # Metrics
    await db.upsert_metrics(metrics)
    logger.info({"message": "Upserted metrics", "count": len(metrics)})

    # Co-author edges
    await db.insert_coauthor_edges(coauthor_edges)
    logger.info({"message": "Inserted coauthor_edges", "count": len(coauthor_edges)})