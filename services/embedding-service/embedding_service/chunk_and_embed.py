"""Chunk-level embedding pipeline for semantic expert search.

Generates per-publication embeddings for each faculty member, stored in
the faculty_chunks table. This replaces the old author-level embeddings
with fine-grained chunks that enable explanation snippets.

Usage:
    python -m embedding_service.chunk_and_embed --rebuild  # truncate + rebuild all
    python -m embedding_service.chunk_and_embed --incremental  # only new chunks
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import logging
import os
import sys
import time
from typing import List, Optional

import asyncpg
from sentence_transformers import SentenceTransformer

MODEL_NAME = "all-MiniLM-L6-v2"
MAX_CHUNK_CHARS = 1500  # ~400 tokens for MiniLM
BATCH_SIZE = 64

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(message)s")


def get_db_dsn() -> str:
    from dotenv import load_dotenv
    load_dotenv()
    user = os.getenv("DB_USER", "postgres")
    pw = os.getenv("DB_PASSWORD", "password")
    host = os.getenv("DB_HOST", "localhost")
    port = os.getenv("DB_PORT", "5432")
    db = os.getenv("DB_NAME", "experts_su")
    return f"postgresql://{user}:{pw}@{host}:{port}/{db}"


def chunk_hash(faculty_id: str, source_type: str, source_id: Optional[str], text: str) -> str:
    """Deterministic hash for deduplication."""
    raw = f"{faculty_id}|{source_type}|{source_id or ''}|{text}"
    return hashlib.md5(raw.encode()).hexdigest()


def truncate_text(text: str, max_chars: int = MAX_CHUNK_CHARS) -> str:
    """Truncate text to max_chars, breaking at word boundary."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0] + "..."


async def build_chunks(conn: asyncpg.Connection) -> list[dict]:
    """Build chunk records from publications and topic profiles."""
    chunks = []

    # ── 1. Publication chunks (title + abstract) ───────────────
    print("📄 Building publication chunks...")
    pub_rows = await conn.fetch("""
        SELECT ap.author_id, p.id as pub_id, p.title, p.abstract, p.year, p.venue
        FROM author_publications ap
        JOIN publications p ON ap.publication_id = p.id
        JOIN authors a ON ap.author_id = a.id
        WHERE a.is_faculty = TRUE
          AND (p.title IS NOT NULL OR p.abstract IS NOT NULL)
        ORDER BY ap.author_id, p.year DESC
    """)

    for row in pub_rows:
        title = row["title"] or ""
        abstract = row["abstract"] or ""
        if not title and not abstract:
            continue
        text = f"{title}. {abstract}".strip() if abstract else title.strip()
        text = truncate_text(text)

        chunks.append({
            "faculty_id": row["author_id"],
            "source_type": "publication",
            "source_id": row["pub_id"],
            "chunk_text": text,
            "chunk_hash": chunk_hash(row["author_id"], "publication", row["pub_id"], text),
            "year": row["year"],
            "venue": row["venue"],
            "publication_title": title,
        })

    print(f"   ✅ {len(chunks)} publication chunks")

    # ── 2. Topic profile chunks ────────────────────────────────
    print("🏷️  Building topic profile chunks...")
    topic_rows = await conn.fetch("""
        SELECT a.id as author_id,
               STRING_AGG(DISTINCT t.name, ', ' ORDER BY t.name) as topics
        FROM authors a
        JOIN author_publications ap ON a.id = ap.author_id
        JOIN publication_topics pt ON ap.publication_id = pt.publication_id
        JOIN topics t ON pt.topic_id = t.id
        WHERE a.is_faculty = TRUE
        GROUP BY a.id
        HAVING COUNT(DISTINCT t.id) > 0
    """)

    topic_count = 0
    for row in topic_rows:
        text = f"Research areas and expertise: {row['topics']}"
        text = truncate_text(text)
        chunks.append({
            "faculty_id": row["author_id"],
            "source_type": "topics",
            "source_id": None,
            "chunk_text": text,
            "chunk_hash": chunk_hash(row["author_id"], "topics", None, text),
            "year": None,
            "venue": None,
            "publication_title": None,
        })
        topic_count += 1

    print(f"   ✅ {topic_count} topic profile chunks")
    print(f"   📊 Total chunks: {len(chunks)}")
    return chunks


async def run(rebuild: bool = False):
    """Main pipeline entry point."""
    dsn = get_db_dsn()
    conn = await asyncpg.connect(dsn)

    try:
        # 1. Build chunks
        all_chunks = await build_chunks(conn)

        if rebuild:
            print("\n🗑️  Rebuild mode: truncating faculty_chunks...")
            await conn.execute("TRUNCATE faculty_chunks")
            new_chunks = all_chunks
        else:
            # Incremental: find chunks not already in DB
            print("\n🔍 Incremental mode: checking for new chunks...")
            existing_hashes = set()
            rows = await conn.fetch("SELECT chunk_hash FROM faculty_chunks")
            existing_hashes = {r["chunk_hash"] for r in rows}
            new_chunks = [c for c in all_chunks if c["chunk_hash"] not in existing_hashes]
            print(f"   {len(all_chunks)} total, {len(existing_hashes)} existing, {len(new_chunks)} new")

        if not new_chunks:
            print("\n✅ No new chunks to embed. Done!")
            return

        # 2. Load model and embed
        print(f"\n🧠 Loading model {MODEL_NAME}...")
        model = SentenceTransformer(MODEL_NAME)
        dim = model.get_sentence_embedding_dimension()
        print(f"   ✅ Model loaded ({dim} dimensions)")

        texts = [c["chunk_text"] for c in new_chunks]
        print(f"\n🔢 Embedding {len(texts)} chunks...")
        t0 = time.time()
        embeddings = model.encode(
            texts,
            batch_size=BATCH_SIZE,
            show_progress_bar=True,
            normalize_embeddings=True,
        )
        elapsed = time.time() - t0
        print(f"   ✅ Embedded in {elapsed:.1f}s ({len(texts)/elapsed:.0f} chunks/s)")

        # 3. Insert into DB
        print(f"\n💾 Inserting {len(new_chunks)} chunks into faculty_chunks...")
        insert_sql = """
            INSERT INTO faculty_chunks
                (faculty_id, source_type, source_id, chunk_text, chunk_hash,
                 year, venue, publication_title, metadata_json, embedding)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (chunk_hash) DO NOTHING
        """

        inserted = 0
        for chunk, emb in zip(new_chunks, embeddings):
            emb_str = "[" + ",".join(str(x) for x in emb.tolist()) + "]"
            await conn.execute(
                insert_sql,
                chunk["faculty_id"],
                chunk["source_type"],
                chunk["source_id"],
                chunk["chunk_text"],
                chunk["chunk_hash"],
                chunk["year"],
                chunk["venue"],
                chunk["publication_title"],
                None,  # metadata_json
                emb_str,
            )
            inserted += 1
            if inserted % 500 == 0:
                print(f"   Inserted {inserted}/{len(new_chunks)}...")

        print(f"   ✅ Inserted {inserted} chunks")

        count = await conn.fetchval("SELECT COUNT(*) FROM faculty_chunks")
        faculty_count = await conn.fetchval("SELECT COUNT(DISTINCT faculty_id) FROM faculty_chunks")
        print(f"\n✨ CHUNK EMBEDDING COMPLETE")
        print(f"   Total chunks in DB: {count}")
        print(f"   Faculty with chunks: {faculty_count}")

    finally:
        await conn.close()


def main():
    parser = argparse.ArgumentParser(description="Chunk and embed faculty expertise data")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--rebuild", action="store_true", help="Truncate and rebuild all chunks")
    group.add_argument("--incremental", action="store_true", help="Only embed new chunks")
    args = parser.parse_args()

    asyncio.run(run(rebuild=args.rebuild))


if __name__ == "__main__":
    main()
