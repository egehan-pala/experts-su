"""Helpers for computing author metrics.

Although metrics are computed in the cleaning phase, this module exposes
stand‑alone functions so that they can be reused independently. Metrics
include publications per year and citation counts per author per year.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Tuple


def compute_author_year_metrics(
    publications: Iterable[Dict], author_publications: Iterable[Dict]
) -> List[Dict[str, int | str]]:
    """Compute publications and citations per author per year.

    Parameters
    ----------
    publications: iterable of publication dicts
        Each dict must include ``id``, ``year`` and ``citations``.
    author_publications: iterable of relation dicts
        Each dict must include ``author_id`` and ``publication_id``.

    Returns
    -------
    List of dicts
        Each dict has keys ``author_id``, ``year``, ``pub_count`` and
        ``citations_year``.
    """
    # Build lookup for publication year and citations
    pub_info: Dict[str, dict] = {
        pub["id"]: {
            "year": pub.get("year"),
            "citations": pub.get("citations", 0),
            "counts_by_year": pub.get("counts_by_year") or []
        }
        for pub in publications
    }
    metrics: Dict[Tuple[str, int], Dict[str, int]] = {}
    for rel in author_publications:
        pid = rel["publication_id"]
        aid = rel["author_id"]
        info = pub_info.get(pid)
        if not info:
            continue
            
        # 1. Update publication count for the year the paper was published
        pub_year = info["year"]
        if pub_year is not None:
            key = (aid, pub_year)
            entry = metrics.setdefault(key, {"pub_count": 0, "citations_year": 0})
            entry["pub_count"] += 1

        # 2. Update citation counts for each year they were received
        counts_by_year = info["counts_by_year"]
        if counts_by_year:
            # Granular data available: use it to distribute citations across years
            for c_entry in counts_by_year:
                c_year = c_entry.get("year")
                c_count = c_entry.get("cited_by_count", 0)
                if c_year:
                    key = (aid, c_year)
                    entry = metrics.setdefault(key, {"pub_count": 0, "citations_year": 0})
                    entry["citations_year"] += c_count
        elif pub_year is not None:
            # Fallback: attribute all citations to the publication year
            key = (aid, pub_year)
            entry = metrics.setdefault(key, {"pub_count": 0, "citations_year": 0})
            entry["citations_year"] += info["citations"]
    return [
        {"author_id": aid, "year": year, **data} for (aid, year), data in metrics.items()
    ]