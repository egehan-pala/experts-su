
import pytest
import json
import sys
import os
import asyncio
from unittest.mock import AsyncMock, patch

# Ensure the src directory is on the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from data_service.etl.cleaners import clean

# Mock Data
INTERNAL_AUTHOR = {
    "id": "https://openalex.org/A1",
    "display_name": "Internal Faculty",
    "orcid": "https://orcid.org/0000-0000-0000-0000",
    "works_count": 10,
    "cited_by_count": 100,
    "created_date": "2020-01-01",
    "updated_date": "2020-01-01"
}

PUBLICATION = {
    "id": "https://openalex.org/W1",
    "display_name": "Collaborative Paper",
    "publication_year": 2023,
    "publication_date": "2023-01-01",
    "type": "article",
    "is_oa": True,
    "authorships": [
        {
            "author": {"id": "https://openalex.org/A1", "display_name": "Internal Faculty", "orcid": "https://orcid.org/0000-0000-0000-0000"},
            "author_position": "first",
            "is_corresponding": True,
            "raw_author_name": "Internal Faculty",
            "countries": ["TR"],
            "institutions": [],
            "raw_affiliation_strings": []
        },
        {
            "author": {"id": "https://openalex.org/A2", "display_name": "External Collaborator", "orcid": None},
            "author_position": "second",
            "is_corresponding": False,
            "raw_author_name": "External Collaborator",
            "countries": ["US"],
            "institutions": [],
            "raw_affiliation_strings": []
        }
    ],
    # Minimal validation required fields
    "ids": {"openalex": "https://openalex.org/W1"},
    "title": "Collaborative Paper"
}

def test_clean_extracts_external_coauthors():
    mock_db = AsyncMock()
    
    async def side_effect_fetch(query):
        if "stg_authors" in query:
            return [{"payload": json.dumps(INTERNAL_AUTHOR)}]
        if "stg_publications" in query:
            return [{"payload": json.dumps(PUBLICATION)}]
        if "stg_author_publications" in query:
            # Return empty to prove the cleaner generates them from the work itself
            return []
        return []

    mock_db.fetch.side_effect = side_effect_fetch

    async def run_test():
        # Patch scrape_all_faculty to return empty list.
        # This disables the "only process whitelisted faculty" check in cleaners.py
        # allowing us to test the general deduplication/extraction logic.
        with patch("data_service.etl.cleaners.scrape_all_faculty", new_callable=AsyncMock) as mock_scrape:
            mock_scrape.return_value = [] 
            
            results = await clean(mock_db)
            return results

    # Run the async test logic synchronously
    results = asyncio.run(run_test())
    
    authors_norm = results[0]
    coauthor_edges = results[6]
    
    # Verify Authors
    # Expect A1 (Internal) and A2 (External)
    author_map = {a["id"]: a for a in authors_norm}
    assert "A1" in author_map, "Internal author A1 missing"
    assert "A2" in author_map, "External author A2 missing"
    
    # Internal author should have full data (mocked)
    assert author_map["A1"]["name"] == "Internal Faculty"
    
    # External author should be created with dept=None
    assert author_map["A2"]["name"] == "External Collaborator"
    assert author_map["A2"]["dept"] is None
    
    # Verify Edges
    # Expect edge between A1 and A2
    edge_found = False
    for edge in coauthor_edges:
        pair = sorted([edge["author_id"], edge["coauthor_id"]])
        if pair == ["A1", "A2"]:
            edge_found = True
            assert edge["weight"] == 1
            break
    
    assert edge_found, "Co-author edge between A1 and A2 was not found"
