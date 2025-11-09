"""Tests for metric computations."""

import os
import sys

# Ensure the src directory is on the Python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from data_service.etl.metrics import compute_author_year_metrics


def test_compute_author_year_metrics():
    publications = [
        {"id": "W1", "year": 2020, "citations": 10},
        {"id": "W2", "year": 2020, "citations": 5},
        {"id": "W3", "year": 2021, "citations": 3},
    ]
    author_publications = [
        {"author_id": "A1", "publication_id": "W1"},
        {"author_id": "A1", "publication_id": "W2"},
        {"author_id": "A2", "publication_id": "W2"},
        {"author_id": "A1", "publication_id": "W3"},
    ]
    metrics = compute_author_year_metrics(publications, author_publications)
    # Convert to dict for easier assertions
    lookup = {(m["author_id"], m["year"]): m for m in metrics}
    assert lookup[("A1", 2020)]["pub_count"] == 2
    assert lookup[("A1", 2020)]["citations_year"] == 15
    assert lookup[("A2", 2020)]["pub_count"] == 1
    assert lookup[("A2", 2020)]["citations_year"] == 5
    assert lookup[("A1", 2021)]["pub_count"] == 1