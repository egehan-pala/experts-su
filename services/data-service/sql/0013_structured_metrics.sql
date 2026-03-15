-- Structured yearly metrics for authors and publications
BEGIN;

CREATE TABLE IF NOT EXISTS publication_citations_yearly (
    publication_id TEXT NOT NULL REFERENCES publications(id) ON DELETE CASCADE,
    year INT NOT NULL,
    count INT NOT NULL,
    PRIMARY KEY (publication_id, year)
);

CREATE TABLE IF NOT EXISTS author_citations_yearly (
    author_id TEXT NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    year INT NOT NULL,
    count INT NOT NULL,
    PRIMARY KEY (author_id, year)
);

-- Index for fast lookups by author/publication
CREATE INDEX IF NOT EXISTS idx_pub_citations_year ON publication_citations_yearly(publication_id);
CREATE INDEX IF NOT EXISTS idx_author_citations_year ON author_citations_yearly(author_id);

COMMIT;
