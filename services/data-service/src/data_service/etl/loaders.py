"""Data loading functions for the ETL pipeline.

This module implements the "load" stage of the ETL process. Given
normalised lists of entities produced by the cleaning stage it upserts
records into the production tables, creates missing topics, and populates
relation tables. Metrics and co-author edges are also loaded. Materialised
views can optionally be refreshed after loading.
"""

from __future__ import annotations

import json
from pathlib import Path
from datetime import datetime
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

    # Populate normalized_name for fuzzy search
    await db.execute("""
        UPDATE authors SET normalized_name = LOWER(
            TRANSLATE(
                name,
                'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿĀāĂăĄąĆćČčĎďĐđĒēĖėĘęĚěĞğĢģĤĥĨĩĪīĮįİıĶķĹĺĻļĽľŁłŃńŅņŇňŌōŐőŒœŔŕŘřŚśŞşŠšŢţŤťŨũŪūŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ',
                'AAAAAAACEEEEIIIIDNOOOOOOUUUUYPsaaaaaaceeeeiiiidnoooooouuuuybyAaAaAaCcCcDdDdEeEeEeEeGgGgHhIiIiIiIiKkLlLlLlLlNnNnNnOoOoOoRrRrSsSsSsTtTtUuUuUuUuUuWwYyYZzZzZzs'
            )
        ) WHERE normalized_name IS NULL OR normalized_name != LOWER(
            TRANSLATE(
                name,
                'ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿĀāĂăĄąĆćČčĎďĐđĒēĖėĘęĚěĞğĢģĤĥĨĩĪīĮįİıĶķĹĺĻļĽľŁłŃńŅņŇňŌōŐőŒœŔŕŘřŚśŞşŠšŢţŤťŨũŪūŮůŰűŲųŴŵŶŷŸŹźŻżŽžſ',
                'AAAAAAACEEEEIIIIDNOOOOOOUUUUYPsaaaaaaceeeeiiiidnoooooouuuuybyAaAaAaCcCcDdDdEeEeEeEeGgGgHhIiIiIiIiKkLlLlLlLlNnNnNnOoOoOoRrRrSsSsSsTtTtUuUuUuUuUuWwYyYZzZzZzs'
            )
        )
    """)
    logger.info({"message": "Updated normalized_name for search"})

    # Populate faculty aliases for fuzzy matching
    # Aliases come from: (1) OpenAlex display names of merged authors
    alias_records = []
    for author in authors:
        if not author.get("is_faculty"):
            continue
        author_id = author["id"]
        author_name = author.get("name", "")

        # If author has merged multiple OA IDs, we don't have their
        # individual display names in the author record, but we can
        # add the canonical name as an alias baseline.
        # The match_map already normalized the name, so the original
        # OA display name can differ. We add the author's own name.
        alias_records.append({"faculty_id": author_id, "alias": author_name})

    if alias_records:
        await db.execute("DELETE FROM faculty_aliases")
        for rec in alias_records:
            try:
                await db.execute(
                    "INSERT INTO faculty_aliases (faculty_id, alias) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    rec["faculty_id"], rec["alias"]
                )
            except Exception:
                pass  # skip duplicates
        logger.info({"message": "Populated faculty_aliases", "count": len(alias_records)})

    # Publications
    await db.upsert_publications(publications)
    # logger.info({"message": "[SKIPPED] Would upsert publications", "count": len(publications)})

    # Author-publication relations
    # Author-publication relations
    await db.upsert_author_publications(author_publications)
    # logger.info({"message": "[SKIPPED] Would upsert author_publications", "count": len(author_publications)})

    # Topics: insert names and fetch their IDs
    # Topics: insert names and fetch their IDs
    name_to_id = await db.upsert_topics(topics)
    # name_to_id = {t.get("name"): f"local_{i}" for i, t in enumerate(topics)}
    # logger.info({"message": "[SKIPPED] Would upsert topics", "count": len(name_to_id)})

    # Create a set of valid publication IDs
    valid_pub_ids = {p["id"] for p in publications}

    # Replace topic names with IDs for publication_topics
    pub_topic_records = []
    for rel in publication_topics:
        if rel["publication_id"] not in valid_pub_ids:
            continue
        topic_name = rel["topic_name"]
        topic_id = name_to_id.get(topic_name)
        if topic_id:
            pub_topic_records.append(
                {"publication_id": rel["publication_id"], "topic_id": topic_id}
            )
    await db.upsert_publication_topics(pub_topic_records)
    # logger.info({"message": "[SKIPPED] Would upsert publication_topics", "count": len(pub_topic_records)})

    # Metrics
    # Metrics
    await db.upsert_metrics(metrics)
    # logger.info({"message": "[SKIPPED] Would upsert metrics", "count": len(metrics)})

    # Co-author edges
    # Co-author edges
    await db.insert_coauthor_edges(coauthor_edges)
    # logger.info({"message": "[SKIPPED] Would insert coauthor_edges", "count": len(coauthor_edges)})


async def save_data_locally(
    authors: List[Dict],
    publications: List[Dict],
    author_publications: List[Dict],
    topics: List[Dict],
    publication_topics: List[Dict],
    metrics: List[Dict],
    coauthor_edges: List[Dict],
) -> None:
    """Save cleaned data to local JSON files instead of uploading to Supabase.

    Creates a timestamped output directory and saves each data type to separate JSON files.
    This is useful for development and testing without consuming Supabase free tier tokens.

    Parameters
    ----------
    authors: List[Dict]
        List of cleaned author records.
    publications: List[Dict]
        List of cleaned publication records.
    author_publications: List[Dict]
        List of author-publication relation records.
    topics: List[Dict]
        List of topic records.
    publication_topics: List[Dict]
        List of publication-topic relation records.
    metrics: List[Dict]
        List of metric records.
    coauthor_edges: List[Dict]
        List of coauthor edge records.
    """
    # Create output directory with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_dir = Path("data_exports") / timestamp
    output_dir.mkdir(parents=True, exist_ok=True)

    # Prepare data dictionary
    data = {
        "authors": authors,
        "publications": publications,
        "author_publications": author_publications,
        "topics": topics,
        "publication_topics": publication_topics,
        "metrics": metrics,
        "coauthor_edges": coauthor_edges,
    }

    # Save each data type to a separate JSON file
    for data_type, records in data.items():
        file_path = output_dir / f"{data_type}.json"
        with open(file_path, "w") as f:
            json.dump(records, f, indent=2)
        logger.info({"message": f"Saved {data_type} to file", "count": len(records), "path": str(file_path)})

    # Save a summary file with metadata
    summary = {
        "timestamp": timestamp,
        "counts": {
            "authors": len(authors),
            "publications": len(publications),
            "author_publications": len(author_publications),
            "topics": len(topics),
            "publication_topics": len(publication_topics),
            "metrics": len(metrics),
            "coauthor_edges": len(coauthor_edges),
        },
        "output_directory": str(output_dir),
    }
    summary_path = output_dir / "summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)
    logger.info({"message": "Saved data export summary", "path": str(summary_path)})