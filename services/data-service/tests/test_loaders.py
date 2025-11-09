"""Tests for the load stage of the ETL pipeline."""

import asyncio
import os
import sys

import pytest

# Ensure the src directory is on the Python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from data_service.etl.loaders import load


class DummyDB:
    def __init__(self):
        self.calls = {}

    async def upsert_authors(self, authors):
        self.calls['authors'] = len(authors)

    async def upsert_publications(self, publications):
        self.calls['publications'] = len(publications)

    async def upsert_author_publications(self, relations):
        self.calls['author_publications'] = len(relations)

    async def upsert_topics(self, topics):
        # return mapping name -> id
        self.calls['topics'] = len(topics)
        return {topic['name']: idx + 1 for idx, topic in enumerate(topics)}

    async def upsert_publication_topics(self, rels):
        self.calls['publication_topics'] = len(rels)

    async def upsert_metrics(self, metrics):
        self.calls['metrics'] = len(metrics)

    async def insert_coauthor_edges(self, edges):
        self.calls['coauthor_edges'] = len(edges)


@pytest.mark.asyncio
async def test_load_calls_db_methods():
    db = DummyDB()
    authors = [{"id": "A1", "name": "Alice"}]
    publications = [{"id": "W1", "title": "Paper"}]
    author_publications = [{"author_id": "A1", "publication_id": "W1"}]
    topics = [{"name": "ML"}]
    publication_topics = [{"publication_id": "W1", "topic_name": "ML"}]
    metrics = [{"author_id": "A1", "year": 2020, "pub_count": 1, "citations_year": 0}]
    edges = []
    await load(db, authors, publications, author_publications, topics, publication_topics, metrics, edges)
    assert db.calls['authors'] == 1
    assert db.calls['publications'] == 1
    assert db.calls['author_publications'] == 1
    assert db.calls['topics'] == 1
    assert db.calls['publication_topics'] == 1
    assert db.calls['metrics'] == 1
    assert db.calls['coauthor_edges'] == 0