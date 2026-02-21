"""Person search using trigram fuzzy matching.

Provides exact-prefix, trigram, and alias-based faculty lookup,
returning ranked PersonResult objects.
"""

from __future__ import annotations

from typing import List

import asyncpg

from search_models import PersonResult


async def person_search(
    query: str,
    pool: asyncpg.Pool,
    limit: int = 10,
    department: str | None = None,
) -> List[PersonResult]:
    """Search for faculty members by name using layered matching.

    1. Exact prefix on normalized_name (fastest, highest confidence)
    2. Trigram similarity on name (fuzzy)
    3. Trigram similarity on aliases
    Results are merged, deduplicated, and sorted by score.
    """
    dept_filter = ""
    params: list = [query, limit]
    if department:
        dept_filter = "AND a.dept ILIKE $3"
        params.append(f"%{department}%")

    # Unified query: combine all matching strategies
    # Each leg is wrapped in a subselect for LIMIT compatibility
    sql = f"""
        WITH candidates AS (
            (SELECT a.id, a.name, a.dept, a.email, a.image_url, a.phone,
                    1.0::float AS score, 'exact'::text AS match_type
             FROM authors a
             WHERE a.is_faculty = TRUE
               AND a.normalized_name LIKE LOWER($1) || '%'
               {dept_filter}
             LIMIT $2)

            UNION ALL

            (SELECT a.id, a.name, a.dept, a.email, a.image_url, a.phone,
                    similarity(a.name, $1)::float AS score, 'fuzzy'::text AS match_type
             FROM authors a
             WHERE a.is_faculty = TRUE
               AND a.name % $1
               {dept_filter}
             LIMIT $2)

            UNION ALL

            (SELECT a.id, a.name, a.dept, a.email, a.image_url, a.phone,
                    similarity(fa.alias, $1)::float AS score, 'alias'::text AS match_type
             FROM faculty_aliases fa
             JOIN authors a ON fa.faculty_id = a.id
             WHERE a.is_faculty = TRUE
               AND fa.alias % $1
               {dept_filter}
             LIMIT $2)
        ),
        ranked AS (
            SELECT DISTINCT ON (id)
                id, name, dept, email, image_url, phone, score, match_type
            FROM candidates
            ORDER BY id, score DESC
        )
        SELECT * FROM ranked
        ORDER BY score DESC
        LIMIT $2
    """

    rows = await pool.fetch(sql, *params)

    return [
        PersonResult(
            id=r["id"],
            name=r["name"],
            dept=r["dept"],
            email=r["email"],
            image_url=r["image_url"],
            phone=r["phone"],
            score=float(r["score"]),
            match_type=r["match_type"],
        )
        for r in rows
    ]


async def suggest(
    query: str,
    pool: asyncpg.Pool,
    limit: int = 5,
) -> List[dict]:
    """Autocomplete: return top matching faculty names for typeahead."""
    # For short queries, trigram matching doesn't work well — use ILIKE prefix
    if len(query.strip()) < 4:
        rows = await pool.fetch("""
            SELECT id, name, dept, image_url, 1.0 AS sim
            FROM authors
            WHERE is_faculty = TRUE AND name ILIKE $1 || '%'
            ORDER BY name
            LIMIT $2
        """, query.strip(), limit)
    else:
        rows = await pool.fetch("""
            SELECT id, name, dept, image_url,
                   similarity(name, $1) AS sim
            FROM authors
            WHERE is_faculty = TRUE AND name % $1
            ORDER BY sim DESC
            LIMIT $2
        """, query, limit)

    return [
        {"id": r["id"], "name": r["name"], "dept": r["dept"], "image_url": r["image_url"]}
        for r in rows
    ]
