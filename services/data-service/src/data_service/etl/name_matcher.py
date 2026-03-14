"""Faculty name matching and disambiguation.

Matches scraped faculty names against OpenAlex author records using
a multi-step strategy (exact → abbreviation → fuzzy) and disambiguates
duplicate names using institution heuristics.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from ..logging import get_logger

logger = get_logger(__name__)


# ── helpers ──────────────────────────────────────────────────────────

def _normalize(name: str) -> str:
    """Collapse whitespace, strip, lowercase."""
    return re.sub(r"\s+", " ", name).strip().lower()


def _strip_accents(s: str) -> str:
    """Remove combining diacritics for looser comparison.
    
    Handles Turkish İ/ı properly: İ → i, ı → i before NFKD decomposition.
    """
    # Pre-normalize Turkish special characters
    s = s.replace("İ", "I").replace("ı", "i").replace("i̇", "i")
    nfkd = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def _tokenize(name: str) -> list[str]:
    """Split a name into tokens, removing dots and splitting hyphens.
    
    Hyphens in compound surnames (e.g. 'Müftüler-Baç') are treated
    as separators so that the resulting tokens match space-separated
    variants ('Müftüler Baç'). Also handles unicode hyphens (U+2010).
    """
    # Replace all hyphen-like characters with spaces before tokenizing
    normalised = re.sub(r"[\-\u2010-\u2015]", " ", _normalize(name))
    return [t.replace(".", "") for t in normalised.split()]


def _tokens_compatible(a: str, b: str) -> bool:
    """Two name tokens are compatible if they match exactly or one is
    an initial of the other."""
    a_s = _strip_accents(a)
    b_s = _strip_accents(b)
    if a_s == b_s:
        return True
    if len(a_s) == 1 and b_s.startswith(a_s):
        return True
    if len(b_s) == 1 and a_s.startswith(b_s):
        return True
    return False


def _names_match_abbreviation(scraped: str, openalex: str) -> bool:
    """Check whether two names refer to the same person, allowing
    middle-name abbreviation.

    Examples:
      "Atıl Utku Ay"  ↔  "Atıl U. Ay"
      "Ali Rana Atılgan"  ↔  "A. R. Atılgan"
    """
    s_tok = _tokenize(scraped)
    o_tok = _tokenize(openalex)

    if len(s_tok) < 2 or len(o_tok) < 2:
        return False

    # Last token must match (surname)
    if _strip_accents(s_tok[-1]) != _strip_accents(o_tok[-1]):
        return False

    s_given = s_tok[:-1]
    o_given = o_tok[:-1]

    if len(s_given) != len(o_given):
        shorter, longer = (s_given, o_given) if len(s_given) <= len(o_given) else (o_given, s_given)
        li = 0
        for st in shorter:
            matched = False
            while li < len(longer):
                lt = longer[li]
                li += 1
                if _tokens_compatible(st, lt):
                    matched = True
                    break
            if not matched:
                return False
        return True

    for s, o in zip(s_given, o_given):
        if not _tokens_compatible(s, o):
            return False
    return True


def _names_match_fuzzy(scraped: str, openalex: str) -> bool:
    """Looser match: strip accents, handle prefix initials."""
    s_stripped = _strip_accents(scraped)
    o_stripped = _strip_accents(openalex)

    if _names_match_abbreviation(s_stripped, o_stripped):
        return True

    s_tok = s_stripped.split()
    o_tok = o_stripped.split()

    if len(o_tok) == len(s_tok) + 1 and len(o_tok[0].replace(".", "")) == 1:
        trimmed = " ".join(o_tok[1:])
        if _names_match_abbreviation(s_stripped, trimmed):
            return True

    if len(s_tok) == len(o_tok) + 1 and len(s_tok[0].replace(".", "")) == 1:
        trimmed = " ".join(s_tok[1:])
        if _names_match_abbreviation(trimmed, o_stripped):
            return True

    return False


def _names_match_set_based(scraped: str, openalex: str) -> bool:
    """Last-resort match: compare names as *unordered* sets of tokens.

    This catches cases where surname components are reordered, merged
    or split differently between the two sources.  All tokens must have
    a pairwise match (exact or initial) but order is ignored.
    """
    s_tok = set(_strip_accents(t) for t in _tokenize(scraped))
    o_tok = set(_strip_accents(t) for t in _tokenize(openalex))

    # Token counts should be close (within ±1 to allow an extra initial)
    if abs(len(s_tok) - len(o_tok)) > 1:
        return False

    shorter, longer = (s_tok, o_tok) if len(s_tok) <= len(o_tok) else (o_tok, s_tok)
    remaining = list(longer)
    for st in shorter:
        matched = False
        for i, lt in enumerate(remaining):
            if _tokens_compatible(st, lt):
                remaining.pop(i)
                matched = True
                break
        if not matched:
            return False
    # Any leftover tokens from the longer set should be initials (len == 1)
    return all(len(r) <= 1 for r in remaining)


def _institution_score(author: dict) -> int:
    """Score how likely this author is the correct Sabancı faculty member.

    Rules:
      - last_known_institutions contains 'Sabancı' → 10
      - last_known_institutions is empty/null        → 5
      - last_known_institutions lists ONLY other unis → 0
    """
    insts = author.get("last_known_institutions") or []
    # Handle both list-of-dicts and list-of-strings
    if not insts:
        return 5
    for inst in insts:
        name = inst if isinstance(inst, str) else (inst.get("display_name") or "")
        if "sabancı" in name.lower() or "sabanci" in name.lower():
            return 10
    return 0


def _disambiguate(candidates: list[dict]) -> tuple[list[dict] | None, str]:
    """Pick the best candidate(s) from a list of same-name OpenAlex authors.

    Include all candidates whose institution score is > 0.  That means both
    Sabancı-tagged (score 10) AND empty-institution (score 5) entries are
    kept.  Only candidates clearly at OTHER universities (score 0) are
    excluded.  If every candidate scores 0, return None (ambiguous).
    """
    if len(candidates) == 1:
        return [candidates[0]], "high"

    scored = [(c, _institution_score(c)) for c in candidates]

    # Keep every candidate with score > 0
    kept = [c for c, s in scored if s > 0]

    if not kept:
        # All candidates are at other universities — truly ambiguous
        return None, "ambiguous"

    best_score = max(s for _, s in scored if s > 0)
    confidence = "high" if best_score >= 10 else "medium"
    return kept, confidence


# ── public API ───────────────────────────────────────────────────────

def match_faculty_to_openalex(
    scraped_faculty: list[dict],
    oa_authors: list[dict],
) -> dict:
    """Match scraped faculty names against OpenAlex author records.

    Parameters
    ----------
    scraped_faculty : list[dict]
        Each dict must have a ``name`` key (the scraped name).
    oa_authors : list[dict]
        Raw OpenAlex author payloads. Each must have ``display_name``,
        ``id``, ``works_count``, ``summary_stats``, ``last_known_institutions``.

    Returns
    -------
    dict with keys ``matched``, ``unmatched``, ``ambiguous``.
    """
    # Normalise OpenAlex authors for matching
    oa_records = []
    for a in oa_authors:
        oa_records.append({
            "openalex_name": a.get("display_name", ""),
            "openalex_id": a.get("id", ""),
            "works_count": a.get("works_count", 0),
            "h_index": (a.get("summary_stats") or {}).get("h_index", 0),
            "last_known_institutions": [
                inst.get("display_name", "") if isinstance(inst, dict) else inst
                for inst in (a.get("last_known_institutions") or [])
            ],
            "_raw": a,  # keep full payload for staging insertion
        })

    # De-duplicate scraped names
    seen: set[str] = set()
    unique_scraped: list[dict] = []
    for f in scraped_faculty:
        key = _normalize(f["name"])
        if key not in seen:
            seen.add(key)
            unique_scraped.append(f)

    logger.info({"message": "Name matching started",
                 "scraped": len(unique_scraped),
                 "openalex": len(oa_records)})

    matched: list[dict] = []
    unmatched_stage1: list[dict] = []
    ambiguous: list[dict] = []

    for faculty in unique_scraped:
        scraped_name = faculty["name"]

        # Step 1: Exact match
        exact = [a for a in oa_records
                 if _normalize(a["openalex_name"]) == _normalize(scraped_name)]
        if exact:
            best_list, conf = _disambiguate(exact)
            if best_list:
                for best in best_list:
                    matched.append({**faculty, **best, "match_type": "exact", "confidence": conf})
            else:
                ambiguous.append({"faculty": faculty, "candidates": exact})
            continue

        # Step 2: Abbreviation-aware match
        abbrev = [a for a in oa_records
                  if _names_match_abbreviation(scraped_name, a["openalex_name"])]
        if abbrev:
            best_list, conf = _disambiguate(abbrev)
            if best_list:
                for best in best_list:
                    matched.append({**faculty, **best, "match_type": "abbreviation", "confidence": conf})
            else:
                ambiguous.append({"faculty": faculty, "candidates": abbrev})
            continue

        # Step 3: Fuzzy match
        fuzzy = [a for a in oa_records
                 if _names_match_fuzzy(scraped_name, a["openalex_name"])]
        if fuzzy:
            best_list, conf = _disambiguate(fuzzy)
            if best_list:
                conf = "medium" if conf == "high" else "low"
                for best in best_list:
                    matched.append({**faculty, **best, "match_type": "fuzzy", "confidence": conf})
            else:
                ambiguous.append({"faculty": faculty, "candidates": fuzzy})
            continue

        unmatched_stage1.append(faculty)

    # Step 4: Set-based match (catches reordered/compound surname edge cases)
    unmatched_final: list[dict] = []
    for faculty in unmatched_stage1:
        scraped_name = faculty["name"]
        setm = [a for a in oa_records
                if _names_match_set_based(scraped_name, a["openalex_name"])]
        if setm:
            best_list, conf = _disambiguate(setm)
            if best_list:
                conf = "medium" if conf == "high" else "low"
                for best in best_list:
                    matched.append({**faculty, **best, "match_type": "set_based", "confidence": conf})
            else:
                ambiguous.append({"faculty": faculty, "candidates": setm})
            continue
        unmatched_final.append(faculty)

    unmatched = unmatched_final

    logger.info({"message": "Name matching complete",
                 "matched": len(matched),
                 "ambiguous": len(ambiguous),
                 "unmatched": len(unmatched)})

    return {"matched": matched, "unmatched": unmatched, "ambiguous": ambiguous}
