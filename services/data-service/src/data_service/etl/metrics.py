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
    pub_info: Dict[str, Tuple[int | None, int]] = {
        pub["id"]: (pub.get("year"), pub.get("citations", 0))
        for pub in publications
    }
    metrics: Dict[Tuple[str, int], Dict[str, int]] = {}
    for rel in author_publications:
        pid = rel["publication_id"]
        aid = rel["author_id"]
        year, citations = pub_info.get(pid, (None, 0))
        if year is None:
            continue
        key = (aid, year)
        entry = metrics.setdefault(key, {"pub_count": 0, "citations_year": 0})
        entry["pub_count"] += 1
        entry["citations_year"] += citations or 0
    return [
        {"author_id": aid, "year": year, **data} for (aid, year), data in metrics.items()
    ]