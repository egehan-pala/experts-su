"""Utilities for computing co‑author networks.

Given a list of author→publication relationships the network builder
aggregates undirected co‑authorship edges and counts how many times each
pair has collaborated. The canonical ordering of author IDs (lexicographically
sorted) is used to avoid duplicate edges.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Tuple


def compute_coauthor_edges(author_publications: Iterable[Dict[str, str]]) -> List[Dict[str, int | str]]:
    """Compute undirected co‑author edges from author‑publication relations.

    Parameters
    ----------
    author_publications: iterable of dicts
        Each dict must include keys ``author_id`` and ``publication_id``.

    Returns
    -------
    List of dicts with keys ``author_id``, ``coauthor_id`` and ``weight``.
    """
    # Build mapping publication_id → list of author_ids
    pub_to_authors: Dict[str, List[str]] = {}
    for rel in author_publications:
        pid = rel["publication_id"]
        aid = rel["author_id"]
        pub_to_authors.setdefault(pid, []).append(aid)
    # Count coauthor edges
    edges_count: Dict[Tuple[str, str], int] = {}
    for authors in pub_to_authors.values():
        unique_authors = sorted(set(authors))
        for i in range(len(unique_authors)):
            for j in range(i + 1, len(unique_authors)):
                a1, a2 = unique_authors[i], unique_authors[j]
                key = (a1, a2)
                edges_count[key] = edges_count.get(key, 0) + 1
    return [
        {"author_id": a1, "coauthor_id": a2, "weight": weight}
        for (a1, a2), weight in edges_count.items()
    ]