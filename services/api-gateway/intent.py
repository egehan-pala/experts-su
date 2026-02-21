"""Intent detection for search queries.

Classifies a search query as PERSON, TOPIC, or MIXED using heuristic
signals based on trigram similarity, token patterns, and academic titles.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Literal

import asyncpg


# ── Thresholds ────────────────────────────────────────────────────
PERSON_SIM_THRESHOLD = 0.25      # trigram similarity to classify as person
MIXED_SIM_THRESHOLD = 0.15       # below PERSON but still plausible
PERSON_TOKEN_MAX = 4             # person queries are typically short


@dataclass
class IntentResult:
    intent: Literal["PERSON", "TOPIC", "MIXED"]
    confidence_person: float
    confidence_topic: float
    best_name_match: str | None = None
    best_name_similarity: float = 0.0


# Patterns that suggest a PERSON query
ACADEMIC_TITLES = re.compile(
    r"\b(prof(?:essor)?|dr|doc(?:ent)?|hoca|öğretim\s+üyesi)\b",
    re.IGNORECASE,
)
EMAIL_PATTERN = re.compile(r"@")
NAME_LIKE = re.compile(r"^[A-Za-zÀ-ÿİıĞğÜüŞşÖöÇç\s\.\-']+$")

# Patterns that suggest a TOPIC query
TOPIC_KEYWORDS = re.compile(
    r"\b(research|algorithm|model|system|theory|analysis|design|method|"
    r"learning|network|data|optimization|energy|material|control|"
    r"security|vision|language|robot|sensor|biology|chemistry|physics|"
    r"economics|policy|history|sociology|psychology|management|finance|"
    r"artificial intelligence|machine learning|deep learning|"
    r"computer science|natural language)\b",
    re.IGNORECASE,
)


async def detect_intent(query: str, pool: asyncpg.Pool) -> IntentResult:
    """Classify query intent using heuristic signals + DB trigram lookup."""
    tokens = query.strip().split()
    n_tokens = len(tokens)

    # ── Signal 1: Trigram similarity against faculty names ─────
    sim_row = await pool.fetchrow("""
        SELECT name, similarity(name, $1) AS sim
        FROM authors
        WHERE is_faculty = TRUE
        ORDER BY name <-> $1
        LIMIT 1
    """, query)

    best_sim = float(sim_row["sim"]) if sim_row else 0.0
    best_name = sim_row["name"] if sim_row else None

    # Also check aliases
    alias_row = await pool.fetchrow("""
        SELECT fa.alias, a.name, similarity(fa.alias, $1) AS sim
        FROM faculty_aliases fa
        JOIN authors a ON fa.faculty_id = a.id
        ORDER BY fa.alias <-> $1
        LIMIT 1
    """, query)

    if alias_row and float(alias_row["sim"]) > best_sim:
        best_sim = float(alias_row["sim"])
        best_name = alias_row["name"]

    # ── Signal 2: Token-based heuristics ──────────────────────
    has_academic_title = bool(ACADEMIC_TITLES.search(query))
    has_email = bool(EMAIL_PATTERN.search(query))
    is_name_like = bool(NAME_LIKE.match(query)) and 1 <= n_tokens <= 3
    has_topic_keywords = bool(TOPIC_KEYWORDS.search(query))

    # ── Scoring ───────────────────────────────────────────────
    person_score = 0.0
    topic_score = 0.0

    # Trigram similarity
    if best_sim >= PERSON_SIM_THRESHOLD:
        person_score += min(best_sim * 1.5, 1.0)
    elif best_sim >= MIXED_SIM_THRESHOLD:
        person_score += best_sim * 0.8

    # Token patterns
    if has_academic_title:
        person_score += 0.4
    if has_email:
        person_score += 0.6
    if is_name_like and n_tokens <= 3:
        person_score += 0.3
    if n_tokens >= 4:
        topic_score += 0.3
    if has_topic_keywords:
        topic_score += 0.5

    # Long queries are almost always topics
    if n_tokens >= 5:
        topic_score += 0.3
        person_score *= 0.5

    # Normalize to 0-1
    person_score = min(person_score, 1.0)
    topic_score = max(min(topic_score, 1.0), 0.2)  # topics always have base score

    # ── Decision ──────────────────────────────────────────────
    if person_score > 0.5 and topic_score > 0.4:
        intent = "MIXED"
    elif person_score > 0.5:
        intent = "PERSON"
    else:
        intent = "TOPIC"

    return IntentResult(
        intent=intent,
        confidence_person=round(person_score, 3),
        confidence_topic=round(topic_score, 3),
        best_name_match=best_name,
        best_name_similarity=round(best_sim, 3),
    )
