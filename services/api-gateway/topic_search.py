"""Topic / semantic expert search using chunk-level embeddings.

Embeds the user query, searches faculty_chunks via pgvector, aggregates
chunk hits to faculty scores, and returns ranked results with explanation
snippets.
"""

from __future__ import annotations

from collections import defaultdict
from typing import List, Optional

import asyncpg
import numpy as np

from search_models import TopicResult, MatchSnippet

# ── Scoring weights ──────────────────────────────────────────────
MAX_SIM_WEIGHT = 0.7
AVG_TOP_WEIGHT = 0.3
TOP_K_CHUNKS = 100    # how many chunks to retrieve from pgvector
TOP_N_PER_FACULTY = 3  # chunks used for scoring + explanation
SNIPPET_MAX_CHARS = 200


def _snippet(text: str, max_chars: int = SNIPPET_MAX_CHARS) -> str:
    """Extract a short snippet from chunk text."""
    if len(text) <= max_chars:
        return text
    return text[:max_chars].rsplit(" ", 1)[0] + "..."


async def topic_search(
    query: str,
    pool: asyncpg.Pool,
    embedding_model,
    limit: int = 10,
    department: str | None = None,
) -> List[TopicResult]:
    """Search for faculty experts by topic using chunk-level semantic search.

    1. Embed the query
    2. pgvector similarity on faculty_chunks (top K)
    3. Aggregate chunks → faculty score
    4. Build explanation snippets from top matching chunks
    """
    # 1. Embed query
    query_embedding = embedding_model.encode(query, normalize_embeddings=True)
    emb_str = "[" + ",".join(str(x) for x in query_embedding.tolist()) + "]"

    # 2. Vector search on chunks
    dept_filter = ""
    params = [emb_str, TOP_K_CHUNKS]
    if department:
        dept_filter = "AND a.dept ILIKE $3"
        params.append(f"%{department}%")
        params.append(query)
        q_param = "$4"
    else:
        params.append(query)
        q_param = "$3"

    rows = await pool.fetch(f"""
        WITH vector_matches AS (
            SELECT
                fc.faculty_id, a.name, a.dept, a.image_url, a.email,
                fc.publication_title, fc.chunk_text, fc.year, fc.source_type,
                1 - (fc.embedding <=> $1::vector) AS vector_sim,
                ROW_NUMBER() OVER (ORDER BY fc.embedding <=> $1::vector) as rank_v,
                1000 as rank_t
            FROM faculty_chunks fc
            JOIN authors a ON fc.faculty_id = a.id
            WHERE a.is_faculty = TRUE AND fc.chunk_text IS NOT NULL
              {dept_filter}
            ORDER BY fc.embedding <=> $1::vector
            LIMIT $2
        ),
        text_matches AS (
            SELECT
                fc.faculty_id, a.name, a.dept, a.image_url, a.email,
                fc.publication_title, fc.chunk_text, fc.year, fc.source_type,
                1 - (fc.embedding <=> $1::vector) AS vector_sim,
                1000 as rank_v,
                ROW_NUMBER() OVER (ORDER BY ts_rank_cd(to_tsvector('english', fc.chunk_text), websearch_to_tsquery('english', {q_param})) DESC) as rank_t
            FROM faculty_chunks fc
            JOIN authors a ON fc.faculty_id = a.id
            WHERE a.is_faculty = TRUE AND fc.chunk_text IS NOT NULL
              {dept_filter}
              AND to_tsvector('english', fc.chunk_text) @@ websearch_to_tsquery('english', {q_param})
            ORDER BY ts_rank_cd(to_tsvector('english', fc.chunk_text), websearch_to_tsquery('english', {q_param})) DESC
            LIMIT $2
        ),
        combined AS (
            SELECT * FROM vector_matches
            UNION ALL
            SELECT * FROM text_matches
        )
        SELECT * FROM combined
    """, *params)

    # 3. Aggregate chunks by faculty
    # faculty_id → list of (similarity, row)
    faculty_chunks: dict[str, list] = defaultdict(list)
    faculty_info: dict[str, dict] = {}

    chunk_map = {}
    for row in rows:
        key = (row["faculty_id"], row["chunk_text"])
        if key not in chunk_map:
            chunk_map[key] = {
                "faculty_id": row["faculty_id"],
                "publication_title": row["publication_title"],
                "chunk_text": row["chunk_text"],
                "year": row["year"],
                "source_type": row["source_type"],
                "vector_sim": row.get("vector_sim", 0.0),
                "rank_v": 1000,
                "rank_t": 1000,
            }
        
        if row["rank_v"] < 1000:
            chunk_map[key]["rank_v"] = row["rank_v"]
        if row["rank_t"] < 1000:
            chunk_map[key]["rank_t"] = row["rank_t"]
            
        fid = row["faculty_id"]
        if fid not in faculty_info:
            faculty_info[fid] = {
                "name": row["name"],
                "dept": row["dept"],
                "image_url": row["image_url"],
                "email": row["email"],
            }

    # Calculate RRF score for unique chunks
    for key, c in chunk_map.items():
        # RRF formula: 1 / (k + rank)
        # Scaled up for readable floats
        rrf_score = (1.0 / (60 + c["rank_v"])) + (1.0 / (60 + c["rank_t"]))
        
        faculty_chunks[c["faculty_id"]].append({
            "similarity": rrf_score,
            "vector_sim": c["vector_sim"],
            "publication_title": c["publication_title"],
            "chunk_text": c["chunk_text"],
            "year": c["year"],
            "source_type": c["source_type"],
        })

    # 4. Score and rank faculties
    scored: list[tuple[str, float, list, float]] = []

    import datetime
    current_year = datetime.datetime.now().year

    for fid, chunks in faculty_chunks.items():
        # Sort chunks by similarity descending
        chunks.sort(key=lambda c: c["similarity"], reverse=True)
        top_chunks = chunks[:TOP_N_PER_FACULTY]

        max_sim = top_chunks[0]["similarity"]
        avg_sim = sum(c["similarity"] for c in top_chunks) / len(top_chunks)
        faculty_score = max_sim * MAX_SIM_WEIGHT + avg_sim * AVG_TOP_WEIGHT

        max_v_sim = top_chunks[0]["vector_sim"]
        avg_v_sim = sum(c["vector_sim"] for c in top_chunks) / len(top_chunks)
        display_score = max_v_sim * MAX_SIM_WEIGHT + avg_v_sim * AVG_TOP_WEIGHT

        # Smart Ranking (Recency Boost)
        years = [c["year"] for c in top_chunks if isinstance(c["year"], int)]
        if years:
            latest_year = max(years)
            if (current_year - latest_year) <= 3:
                faculty_score *= 1.15

        scored.append((fid, faculty_score, top_chunks, display_score))

    # Sort by faculty score
    scored.sort(key=lambda x: x[1], reverse=True)
    scored = scored[:limit]

    # 5. Build response
    results: List[TopicResult] = []
    for fid, score, top_chunks, display_score in scored:
        info = faculty_info[fid]
        snippets = []
        for c in top_chunks:
            snippets.append(MatchSnippet(
                publication_title=c["publication_title"],
                snippet=_snippet(c["chunk_text"]),
                year=c["year"],
                similarity=round(c["vector_sim"], 4),
            ))

        results.append(TopicResult(
            id=fid,
            name=info["name"],
            dept=info["dept"],
            image_url=info["image_url"],
            email=info["email"],
            similarity=round(display_score, 4),
            explanation=snippets,
        ))

    return results
