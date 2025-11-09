-- Optional materialized view for author yearly metrics

BEGIN;

-- Drop existing view if exists to allow recreation
DROP MATERIALIZED VIEW IF EXISTS author_metrics_yearly_mv;

CREATE MATERIALIZED VIEW author_metrics_yearly_mv AS
SELECT
    ap.author_id,
    p.year AS year,
    COUNT(*) AS pub_count,
    COALESCE(SUM(p.citations), 0) AS citations_year
FROM author_publications ap
JOIN publications p ON ap.publication_id = p.id
GROUP BY ap.author_id, p.year
WITH DATA;

-- Refresh helper function
CREATE OR REPLACE FUNCTION refresh_author_metrics_mv() RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY author_metrics_yearly_mv;
END;
$$ LANGUAGE plpgsql;

COMMIT;