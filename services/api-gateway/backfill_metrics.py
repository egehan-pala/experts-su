import asyncio
import json
import os
import asyncpg
from dotenv import load_dotenv
from collections import defaultdict

load_dotenv()
DB_DSN = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'password')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'experts_su')}"

async def main():
    print("Connecting to database...")
    conn = await asyncpg.connect(DB_DSN)
    
    print("Fetching association and publication data...")
    # Join author_publications with publications to get all data needed for aggregation
    rows = await conn.fetch("""
        SELECT ap.author_id, p.id as pub_id, p.year, p.citations, p.counts_by_year_json
        FROM author_publications ap
        JOIN publications p ON ap.publication_id = p.id
    """)
    print(f"Loaded {len(rows)} author-publication relations.")

    metrics = defaultdict(lambda: {"pub_count": 0, "citations_year": 0})

    print("Aggregating metrics...")
    for row in rows:
        aid = row["author_id"]
        pub_year = row["year"]
        
        # 1. Update publication count for the year the paper was published
        if pub_year is not None:
            key = (aid, pub_year)
            metrics[key]["pub_count"] += 1

        # 2. Update citation counts for each year they were received
        counts_by_year_json = row["counts_by_year_json"]
        counts_by_year = None
        if counts_by_year_json:
            try:
                counts_by_year = json.loads(counts_by_year_json)
            except:
                pass
        
        if counts_by_year:
            for c_entry in counts_by_year:
                c_year = c_entry.get("year")
                c_count = c_entry.get("cited_by_count", 0)
                if c_year:
                    key = (aid, c_year)
                    metrics[key]["citations_year"] += c_count
        elif pub_year:
            # Fallback
            key = (aid, pub_year)
            metrics[key]["citations_year"] += (row["citations"] or 0)

    print(f"Aggregated {len(metrics)} author-year entries.")

    # Prepare for insertion
    records = []
    for (aid, year), data in metrics.items():
        if data["pub_count"] > 0 or data["citations_year"] > 0:
            records.append((aid, year, data["pub_count"], data["citations_year"]))

    print(f"Updating author_metrics_yearly table with {len(records)} records...")
    async with conn.transaction():
        await conn.execute("TRUNCATE author_metrics_yearly")
        
        # Insert in batches
        query = """
            INSERT INTO author_metrics_yearly (author_id, year, pub_count, citations_year)
            VALUES ($1, $2, $3, $4)
        """
        batch_size = 500
        for i in range(0, len(records), batch_size):
            batch = records[i:i + batch_size]
            await conn.executemany(query, batch)
            if (i // batch_size) % 10 == 0:
                print(f"  Processed {i}/{len(records)} records...")

    print("Backfill complete!")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
