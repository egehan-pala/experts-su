-- Table to store internal citation edges between SU authors
CREATE TABLE IF NOT EXISTS citation_edges (
    citing_author_id TEXT REFERENCES authors(id) ON DELETE CASCADE,
    cited_author_id TEXT REFERENCES authors(id) ON DELETE CASCADE,
    citation_count INT DEFAULT 0,
    PRIMARY KEY (citing_author_id, cited_author_id)
);

CREATE INDEX IF NOT EXISTS idx_citation_edges_citing ON citation_edges(citing_author_id);
CREATE INDEX IF NOT EXISTS idx_citation_edges_cited ON citation_edges(cited_author_id);
