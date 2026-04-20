BEGIN;

CREATE TABLE IF NOT EXISTS author_news_feeds (
    id SERIAL PRIMARY KEY,
    author_id TEXT REFERENCES authors(id) ON DELETE CASCADE,
    feed_url TEXT NOT NULL,
    feed_label TEXT NOT NULL
);

COMMIT;
