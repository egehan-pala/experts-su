import asyncio
import json
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv()
DB_DSN = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'password')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'experts_su')}"

async def main():
    conn = await asyncpg.connect(DB_DSN)
    
    # 1. Pick a sample author who has publications with granular citation data
    author = await conn.fetchrow("""
        SELECT a.id, a.name 
        FROM authors a
        JOIN author_metrics_yearly amy ON a.id = amy.author_id
        WHERE amy.citations_year > 0
        LIMIT 1
    """)
    if not author:
        print("No author with citations found.")
        await conn.close()
        return

    author_id = author["id"]
    print(f"Verifying metrics for: {author['name']} ({author_id})")

    # 2. Get current metrics from author_metrics_yearly
    metrics = await conn.fetch("""
        SELECT year, pub_count, citations_year 
        FROM author_metrics_yearly 
        WHERE author_id = $1 
        ORDER BY year DESC
        LIMIT 5
    """, author_id)
    
    print("\nCurrent metrics in DB:")
    for m in metrics:
        print(f"  Year {m['year']}: Pubs={m['pub_count']}, Cites={m['citations_year']}")

    # 3. Get raw publication data for this author
    pubs = await conn.fetch("""
        SELECT p.id, p.year, p.citations, p.counts_by_year_json
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id = $1
    """, author_id)

    print("\nSource Publications Data (Raw):")
    total_received_2024 = 0
    for p in pubs:
        counts = json.loads(p["counts_by_year_json"] or "[]")
        for c in counts:
            if c["year"] == 2024:
                total_received_2024 += c["cited_by_count"]
    
    print(f"  Calculated citations received in 2024 (from raw data): {total_received_2024}")
    
    db_2024 = next((m["citations_year"] for m in metrics if m["year"] == 2024), 0)
    print(f"  Database citations_year for 2024: {db_2024}")
    
    if total_received_2024 == db_2024:
        print("\n✅ Verification SUCCESS: Database metrics match raw granular data!")
    else:
        print("\n❌ Verification FAILED: Database metrics do NOT match raw granular data.")

    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
