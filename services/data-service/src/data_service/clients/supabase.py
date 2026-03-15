"""Database client for Supabase/PostgreSQL.

This module provides a thin asynchronous wrapper around an asyncpg
connection pool. The methods defined here implement the minimal set of
operations required by the ETL pipeline: inserting staged records,
upserting production records, and retrieving staging data for cleaning.

Having a dedicated database class encapsulates SQL statements in one
place and makes it simpler to switch to a different driver or add
instrumentation in the future.
"""

from __future__ import annotations

import json
import sys
import time
from typing import Any, Dict, Iterable, List, Optional

import asyncpg

from ..config import Settings
from ..logging import get_logger

logger = get_logger(__name__)
from ..utils.hashing import compute_hash


class Database:
    """Asynchronous database client based on asyncpg."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._pool: Optional[asyncpg.Pool] = None

    async def connect(self) -> None:
        """Create a connection pool to the configured database."""
        if self._pool is None:
            self._pool = await asyncpg.create_pool(
                host=self._settings.db_host,
                port=self._settings.db_port,
                user=self._settings.db_user,
                password=self._settings.db_password,
                database=self._settings.db_name,
            )

    async def close(self) -> None:
        """Close the connection pool."""
        if self._pool:
            await self._pool.close()
            self._pool = None

    async def execute(self, query: str, *args: Any) -> str:
        """Execute a statement and return the status string."""
        assert self._pool is not None, "Database not connected"
        async with self._pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetch(self, query: str, *args: Any) -> List[asyncpg.Record]:
        """Fetch multiple rows as a list of asyncpg.Record objects."""
        assert self._pool is not None, "Database not connected"
        async with self._pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args: Any) -> Optional[asyncpg.Record]:
        """Fetch a single row."""
        assert self._pool is not None, "Database not connected"
        async with self._pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def _executemany_batched(
        self,
        query: str,
        records: List[tuple],
        label: str = "records",
        batch_size: int = 500,
    ) -> None:
        """Execute an INSERT/UPSERT in batches with progress logging.

        Parameters
        ----------
        query: str
            The parameterised SQL statement.
        records: List[tuple]
            All rows to insert.
        label: str
            Human-readable name used in progress logs.
        batch_size: int
            Number of rows per batch (default 500).
        """
        if not records:
            return
        assert self._pool is not None, "Database not connected"
        total = len(records)
        start = time.time()
        for i in range(0, total, batch_size):
            batch = records[i : i + batch_size]
            async with self._pool.acquire() as conn:
                await conn.executemany(query, batch)
            done = min(i + batch_size, total)
            elapsed = time.time() - start
            logger.info(
                {
                    "message": f"Upserted {label}",
                    "progress": f"{done}/{total}",
                    "elapsed_s": round(elapsed, 1),
                }
            )
            print(f"  ↳ {label}: {done}/{total} ({round(elapsed, 1)}s)", flush=True)

    # ------------------------------------------------------------------
    # Staging insert helpers
    #
    async def insert_staging_authors(self, authors: Iterable[Dict[str, Any]]) -> None:
        """Insert raw author payloads into the staging table.

        Parameters
        ----------
        authors: Iterable[Dict[str, Any]]
            A sequence of author JSON objects returned from the OpenAlex API.
        """
        query = (
            "INSERT INTO stg_authors (source_id, payload, source_hash, fetched_at) "
            "VALUES ($1, $2, $3, NOW()) ON CONFLICT (source_id) DO NOTHING"
        )
        records = []
        for author in authors:
            source_id = author.get("id")
            source_hash = compute_hash(author)
            records.append((source_id, json.dumps(author), source_hash))
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)

    async def insert_staging_publications(self, works: Iterable[Dict[str, Any]]) -> None:
        """Insert raw work payloads into the staging table."""
        query = (
            "INSERT INTO stg_publications (source_id, payload, source_hash, fetched_at) "
            "VALUES ($1, $2, $3, NOW()) ON CONFLICT (source_id) DO NOTHING"
        )
        records = []
        for work in works:
            source_id = work.get("id")
            source_hash = compute_hash(work)
            records.append((source_id, json.dumps(work), source_hash))
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)

    async def insert_staging_author_publications(self, pairs: Iterable[tuple[str, str]]) -> None:
        """Insert relationships between author and work in staging."""
        query = (
            "INSERT INTO stg_author_publications (source_id, payload, source_hash, fetched_at) "
            "VALUES ($1, $2, $3, NOW()) ON CONFLICT (source_id) DO NOTHING"
        )
        records = []
        for author_id, work_id in pairs:
            payload = {"author_id": author_id, "work_id": work_id}
            source_id = f"{author_id}:{work_id}"
            source_hash = compute_hash(payload)
            records.append((source_id, json.dumps(payload), source_hash))
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)

    # ------------------------------------------------------------------
    # ETL state helpers
    #
    async def get_etl_state(self, key: str) -> Optional[str]:
        """Retrieve the state value for a given key."""
        row = await self.fetchrow(
            "SELECT value FROM etl_state WHERE key = $1", key
        )
        return row["value"] if row else None

    async def set_etl_state(self, key: str, value: str) -> None:
        """Upsert a key/value pair into the ETL state table."""
        await self.execute(
            "INSERT INTO etl_state (key, value, updated_at) VALUES ($1, $2, NOW()) "
            "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
            key,
            value,
        )

    # ------------------------------------------------------------------
    # Production upsert helpers
    #
    async def upsert_authors(self, authors: Iterable[Dict[str, Any]]) -> None:
        """Upsert normalised author records with all OpenAlex fields."""
        query = """
            INSERT INTO authors (
                id, orcid, name, dept, email, phone, ror_id, image_url, is_faculty,
                works_count, cited_by_count, h_index, i10_index, two_yr_mean_citedness,
                last_known_institution, last_known_institution_country,
                affiliations_json, topics_json, counts_by_year_json,
                openalex_created_date, openalex_updated_date,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                orcid = EXCLUDED.orcid, name = EXCLUDED.name, dept = EXCLUDED.dept,
                email = EXCLUDED.email, phone = EXCLUDED.phone, ror_id = EXCLUDED.ror_id,
                image_url = EXCLUDED.image_url, is_faculty = EXCLUDED.is_faculty,
                works_count = EXCLUDED.works_count, cited_by_count = EXCLUDED.cited_by_count,
                h_index = EXCLUDED.h_index, i10_index = EXCLUDED.i10_index, two_yr_mean_citedness = EXCLUDED.two_yr_mean_citedness,
                last_known_institution = EXCLUDED.last_known_institution, last_known_institution_country = EXCLUDED.last_known_institution_country,
                affiliations_json = EXCLUDED.affiliations_json, topics_json = EXCLUDED.topics_json, counts_by_year_json = EXCLUDED.counts_by_year_json,
                openalex_created_date = EXCLUDED.openalex_created_date, openalex_updated_date = EXCLUDED.openalex_updated_date,
                updated_at = NOW()
        """
        records = []
        for author in authors:
            records.append((
                author["id"],
                author.get("orcid"),
                author["name"],
                author.get("dept"),
                author.get("email"),
                author.get("phone"),
                author.get("ror_id"),
                author.get("image_url"),
                author.get("is_faculty"),
                author.get("works_count"),
                author.get("cited_by_count"),
                author.get("h_index"),
                author.get("i10_index"),
                author.get("two_yr_mean_citedness"),
                author.get("last_known_institution"),
                author.get("last_known_institution_country"),
                author.get("affiliations_json"),
                author.get("topics_json"),
                author.get("counts_by_year_json"),
                author.get("openalex_created_date"),
                author.get("openalex_updated_date"),
            ))
        await self._executemany_batched(query, records, label="authors")

    async def upsert_publications(self, works: Iterable[Dict[str, Any]]) -> None:
        """Upsert normalised publication records with all OpenAlex fields."""
        query = """
            INSERT INTO publications (
                id, doi, title, abstract, year, publication_date, venue, citations,
                type, type_crossref, is_oa, is_retracted, language,
                venue_id, venue_issn, venue_type,
                volume, issue, first_page, last_page,
                pdf_url, landing_page_url, oa_url, license,
                primary_topic, topics_json, concepts_json, keywords_json,
                authorships_json, author_count,
                referenced_works_count, counts_by_year_json, grants_json,
                openalex_created_date, openalex_updated_date,
                created_at, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET
                doi = EXCLUDED.doi, title = EXCLUDED.title, abstract = EXCLUDED.abstract,
                year = EXCLUDED.year, publication_date = EXCLUDED.publication_date, venue = EXCLUDED.venue, citations = EXCLUDED.citations,
                type = EXCLUDED.type, type_crossref = EXCLUDED.type_crossref, is_oa = EXCLUDED.is_oa, is_retracted = EXCLUDED.is_retracted, language = EXCLUDED.language,
                venue_id = EXCLUDED.venue_id, venue_issn = EXCLUDED.venue_issn, venue_type = EXCLUDED.venue_type,
                volume = EXCLUDED.volume, issue = EXCLUDED.issue, first_page = EXCLUDED.first_page, last_page = EXCLUDED.last_page,
                pdf_url = EXCLUDED.pdf_url, landing_page_url = EXCLUDED.landing_page_url, oa_url = EXCLUDED.oa_url, license = EXCLUDED.license,
                primary_topic = EXCLUDED.primary_topic, topics_json = EXCLUDED.topics_json, concepts_json = EXCLUDED.concepts_json, keywords_json = EXCLUDED.keywords_json,
                authorships_json = EXCLUDED.authorships_json, author_count = EXCLUDED.author_count,
                referenced_works_count = EXCLUDED.referenced_works_count, counts_by_year_json = EXCLUDED.counts_by_year_json, grants_json = EXCLUDED.grants_json,
                openalex_created_date = EXCLUDED.openalex_created_date, openalex_updated_date = EXCLUDED.openalex_updated_date,
                updated_at = NOW()
        """
        records = []
        for work in works:
            records.append((
                work["id"],
                work.get("doi"),
                work.get("title"),
                work.get("abstract"),
                work.get("year"),
                work.get("publication_date"),
                work.get("venue"),
                work.get("citations", 0),
                work.get("type"),
                work.get("type_crossref"),
                work.get("is_oa"),
                work.get("is_retracted"),
                work.get("language"),
                work.get("venue_id"),
                work.get("venue_issn"),
                work.get("venue_type"),
                work.get("volume"),
                work.get("issue"),
                work.get("first_page"),
                work.get("last_page"),
                work.get("pdf_url"),
                work.get("landing_page_url"),
                work.get("oa_url"),
                work.get("license"),
                work.get("primary_topic"),
                work.get("topics_json"),
                work.get("concepts_json"),
                work.get("keywords_json"),
                work.get("authorships_json"),
                work.get("author_count"),
                work.get("referenced_works_count"),
                work.get("counts_by_year_json"),
                work.get("grants_json"),
                work.get("openalex_created_date"),
                work.get("openalex_updated_date"),
            ))
        await self._executemany_batched(query, records, label="publications")

    async def upsert_author_publications(self, relations: Iterable[Dict[str, Any]]) -> None:
        """Upsert author-publication relation records."""
        query = (
            "INSERT INTO author_publications (author_id, publication_id) "
            "VALUES ($1, $2) ON CONFLICT DO NOTHING"
        )
        records = []
        for rel in relations:
            records.append((rel["author_id"], rel["publication_id"]))
        await self._executemany_batched(query, records, label="author_publications")

    async def upsert_topics(self, topics: Iterable[Dict[str, Any]]) -> None:
        """Upsert topics into the topics table and return their IDs.

        Topics are deduplicated by name. This method returns a mapping from
        topic name to assigned primary key.
        """
        # We first insert names, ignoring duplicates; then we fetch ids.
        insert_query = (
            "INSERT INTO topics (name) VALUES ($1) ON CONFLICT (name) DO NOTHING"
        )
        names = [topic["name"] for topic in topics]
        if not names:
            return
        await self._executemany_batched(insert_query, [(name,) for name in names], label="topics")
        # Fetch ids
        select_query = "SELECT id, name FROM topics WHERE name = ANY($1::text[])"
        rows = await self.fetch(select_query, names)
        name_to_id = {row["name"]: row["id"] for row in rows}
        return name_to_id

    async def upsert_publication_topics(self, rels: Iterable[Dict[str, Any]]) -> None:
        """Upsert publication-topic relationship records."""
        query = (
            "INSERT INTO publication_topics (publication_id, topic_id) "
            "VALUES ($1, $2) ON CONFLICT DO NOTHING"
        )
        records = [(rel["publication_id"], rel["topic_id"]) for rel in rels]
        await self._executemany_batched(query, records, label="publication_topics")

    async def upsert_metrics(self, metrics: Iterable[Dict[str, Any]]) -> None:
        """Insert or update author-year metrics.

        Metrics are upserted into a separate table or materialized view via
        simple inserts; the author_metrics_yearly view is refreshed after
        loading data in a separate step. If you choose to store metrics in
        a table (not a view), adjust this method accordingly.
        """
        query = (
            "INSERT INTO author_metrics_yearly (author_id, year, pub_count, citations_year) "
            "VALUES ($1, $2, $3, $4) ON CONFLICT (author_id, year) DO UPDATE SET "
            "pub_count = EXCLUDED.pub_count, citations_year = EXCLUDED.citations_year"
        )
        records = []
        for m in metrics:
            records.append((m["author_id"], m["year"], m["pub_count"], m["citations_year"]))
        await self._executemany_batched(query, records, label="metrics")

    async def insert_coauthor_edges(self, edges: Iterable[Dict[str, Any]]) -> None:
        """Insert co-author edges into the coauthor_edges table.

        Edges are inserted via upsert semantics; duplicates are ignored by
        primary key constraint on (author_id, coauthor_id).
        """
        query = (
            "INSERT INTO coauthor_edges (author_id, coauthor_id, edge_weight) "
            "VALUES ($1, $2, $3) ON CONFLICT (author_id, coauthor_id) DO UPDATE SET "
            "edge_weight = coauthor_edges.edge_weight + EXCLUDED.edge_weight"
        )
        records = []
        for edge in edges:
            records.append((edge["author_id"], edge["coauthor_id"], edge["weight"]))
        await self._executemany_batched(query, records, label="coauthor_edges")

    async def upsert_author_citations_yearly(self, citations: List[Dict[str, Any]]) -> None:
        """Upsert author yearly citation counts."""
        query = """
            INSERT INTO author_citations_yearly (author_id, year, count)
            VALUES ($1, $2, $3)
            ON CONFLICT (author_id, year) DO UPDATE SET count = EXCLUDED.count
        """
        records = [(c["author_id"], c["year"], c["count"]) for c in citations]
        await self._executemany_batched(query, records, label="author_citations_yearly")

    async def upsert_publication_citations_yearly(self, citations: List[Dict[str, Any]]) -> None:
        """Upsert publication yearly citation counts."""
        query = """
            INSERT INTO publication_citations_yearly (publication_id, year, count)
            VALUES ($1, $2, $3)
            ON CONFLICT (publication_id, year) DO UPDATE SET count = EXCLUDED.count
        """
        records = [(c["publication_id"], c["year"], c["count"]) for c in citations]
        await self._executemany_batched(query, records, label="publication_citations_yearly")