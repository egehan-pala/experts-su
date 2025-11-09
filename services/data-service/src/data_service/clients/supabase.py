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
from typing import Any, Dict, Iterable, List, Optional

import asyncpg

from ..config import Settings
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
        """Upsert normalised author records into the authors table."""
        query = (
            "INSERT INTO authors (id, orcid, name, dept, email, ror_id, created_at, updated_at) "
            "VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW()) "
            "ON CONFLICT (id) DO UPDATE SET "
            "orcid = EXCLUDED.orcid, name = EXCLUDED.name, dept = EXCLUDED.dept, "
            "email = EXCLUDED.email, ror_id = EXCLUDED.ror_id, updated_at = NOW()"
        )
        records = []
        for author in authors:
            records.append(
                (
                    author["id"],
                    author.get("orcid"),
                    author["name"],
                    author.get("dept"),
                    author.get("email"),
                    author.get("ror_id"),
                )
            )
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)

    async def upsert_publications(self, works: Iterable[Dict[str, Any]]) -> None:
        """Upsert normalised publication records into the publications table."""
        query = (
            "INSERT INTO publications (id, doi, title, abstract, year, venue, citations, created_at, updated_at) "
            "VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW()) "
            "ON CONFLICT (id) DO UPDATE SET "
            "doi = EXCLUDED.doi, title = EXCLUDED.title, abstract = EXCLUDED.abstract, "
            "year = EXCLUDED.year, venue = EXCLUDED.venue, citations = EXCLUDED.citations, updated_at = NOW()"
        )
        records = []
        for work in works:
            records.append(
                (
                    work["id"],
                    work.get("doi"),
                    work.get("title"),
                    work.get("abstract"),
                    work.get("year"),
                    work.get("venue"),
                    work.get("citations", 0),
                )
            )
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)

    async def upsert_author_publications(self, relations: Iterable[Dict[str, Any]]) -> None:
        """Upsert author-publication relation records."""
        query = (
            "INSERT INTO author_publications (author_id, publication_id) "
            "VALUES ($1, $2) ON CONFLICT DO NOTHING"
        )
        records = []
        for rel in relations:
            records.append((rel["author_id"], rel["publication_id"]))
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)

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
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(insert_query, [(name,) for name in names])
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
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)

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
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)

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
        if not records:
            return
        assert self._pool is not None
        async with self._pool.acquire() as conn:
            await conn.executemany(query, records)