
import pytest
import json
import sys
import os
import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock, mock_open

# Ensure the src directory is on the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from data_service.etl.cleaners import clean

# ── Mock Data ──────────────────────────────────────────────────────────────────

INTERNAL_AUTHOR = {
    "id": "https://openalex.org/A1",
    "display_name": "Internal Faculty",
    "orcid": "https://orcid.org/0000-0000-0000-0000",
    "works_count": 10,
    "cited_by_count": 100,
    "created_date": "2020-01-01",
    "updated_date": "2020-01-01",
    "summary_stats": {"h_index": 5, "i10_index": 3, "2yr_mean_citedness": 1.0},
    "affiliations": [],
    "topics": [],
    "counts_by_year": [],
    "last_known_institutions": [],
}

PUBLICATION = {
    "id": "https://openalex.org/W1",
    "display_name": "Collaborative Paper",
    "title": "Collaborative Paper",
    "publication_year": 2023,
    "publication_date": "2023-01-01",
    "type": "article",
    "is_oa": True,
    "cited_by_count": 5,
    "authorships": [
        {
            "author": {
                "id": "https://openalex.org/A1",
                "display_name": "Internal Faculty",
                "orcid": "https://orcid.org/0000-0000-0000-0000",
            },
            "author_position": "first",
            "is_corresponding": True,
            "raw_author_name": "Internal Faculty",
            "countries": ["TR"],
            "institutions": [{"id": "I1", "display_name": "Sabanci University",
                               "ror": "https://ror.org/049asqa32", "country_code": "TR"}],
            "raw_affiliation_strings": ["Sabanci University"],
        },
        {
            "author": {
                "id": "https://openalex.org/A2",
                "display_name": "External Collaborator",
                "orcid": None,
            },
            "author_position": "second",
            "is_corresponding": False,
            "raw_author_name": "External Collaborator",
            "countries": ["US"],
            "institutions": [],
            "raw_affiliation_strings": [],
        },
    ],
    "ids": {"openalex": "https://openalex.org/W1"},
    "concepts": [],
    "topics": [],
    "keywords": [],
    "grants": [],
    "referenced_works": [],
    "counts_by_year": [],
    "sustainable_development_goals": [],
}

# match_map.json: short OpenAlex ID → scraped faculty info
MATCH_MAP = {
    "A1": {
        "scraped_name": "Internal Faculty",
        "dept": "FENS",
        "email": "internal@sabanciuniv.edu",
        "phone": None,
        "image_url": None,
    }
}


def test_clean_extracts_external_coauthors():
    mock_db = AsyncMock()

    async def side_effect_fetch(query):
        if "stg_authors" in query:
            return [{"payload": json.dumps(INTERNAL_AUTHOR)}]
        if "stg_publications" in query:
            return [{"payload": json.dumps(PUBLICATION)}]
        if "stg_author_publications" in query:
            return []
        return []

    mock_db.fetch.side_effect = side_effect_fetch

    # Build a fake Path that reports match_map.json as existing
    class FakePath:
        def __init__(self, *args):
            self._parts = args

        def __truediv__(self, other):
            return FakePath(*self._parts, other)

        def exists(self):
            # Report the match_map.json path as present so clean() loads it
            return True

        def __str__(self):
            return "/".join(str(p) for p in self._parts)

    async def run_test():
        # Fake settings to avoid needing real env vars in CI / Docker build
        fake_settings = MagicMock()
        fake_settings.openalex_ror_id = "https://ror.org/049asqa32"
        fake_settings.openalex_work_types = ["article", "preprint"]
        fake_settings.max_authors_per_work = 20

        with patch("data_service.etl.cleaners.scrape_all_faculty",
                   new_callable=AsyncMock) as mock_scrape, \
             patch("data_service.etl.cleaners.fetch_career_start_year",
                   new_callable=AsyncMock, return_value=None), \
             patch("data_service.etl.cleaners.get_settings", return_value=fake_settings), \
             patch("pathlib.Path", FakePath), \
             patch("builtins.open", mock_open(read_data=json.dumps(MATCH_MAP))), \
             patch("json.load", return_value=MATCH_MAP):

            mock_scrape.return_value = []
            results = await clean(mock_db)
            return results

    results = asyncio.run(run_test())

    authors_norm = results[0]
    coauthor_edges = results[6]

    author_map = {a["id"]: a for a in authors_norm}
    assert "A1" in author_map, f"Internal author A1 missing. Found: {list(author_map.keys())}"
    assert "A2" in author_map, f"External author A2 missing. Found: {list(author_map.keys())}"

    assert author_map["A1"]["name"] == "Internal Faculty"
    assert author_map["A2"]["name"] == "External Collaborator"
    assert author_map["A2"]["dept"] is None

    edge_found = any(
        sorted([e["author_id"], e["coauthor_id"]]) == ["A1", "A2"]
        for e in coauthor_edges
    )
    assert edge_found, f"Co-author edge A1↔A2 not found. Edges: {coauthor_edges}"
