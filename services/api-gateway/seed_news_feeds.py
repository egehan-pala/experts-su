"""
Seed script: populate author_news_feeds with improved queries.

Strategy per author:
1. Name + "Sabancı" query  (reduces false positives)
2. If ORCID exists → also add an ORCID-based feed (zero false positives)

Run: docker exec experts-su-api-gateway python seed_news_feeds.py
"""
import asyncio
import urllib.parse
import os
from dotenv import load_dotenv
import asyncpg

load_dotenv()

DB_DSN = (
    f"postgresql://{os.getenv('DB_USER','postgres')}:{os.getenv('DB_PASSWORD','password')}"
    f"@{os.getenv('DB_HOST','localhost')}:{os.getenv('DB_PORT','5432')}/{os.getenv('DB_NAME','experts_su')}"
)


def build_name_sabancu_url(name: str) -> str:
    """Search for author name AND exact phrase 'Sabancı Üniversitesi'."""
    q = urllib.parse.quote(f'"{name}" "Sabancı Üniversitesi"')
    return f"https://news.google.com/rss/search?q={q}&hl=tr&gl=TR&ceid=TR:tr"


def build_orcid_url(orcid: str) -> str:
    """Search using the bare ORCID ID (e.g. 0000-0002-5274-6790).
    Extremely specific — only returns articles that mention the ORCID."""
    orcid_id = orcid.replace("https://orcid.org/", "").strip()
    q = urllib.parse.quote(orcid_id)
    return f"https://news.google.com/rss/search?q={q}&hl=tr&gl=TR&ceid=TR:tr"


async def main():
    pool = await asyncpg.create_pool(DB_DSN)
    async with pool.acquire() as conn:
        # Clear old feeds so we start fresh with improved queries
        deleted = await conn.fetchval("DELETE FROM author_news_feeds RETURNING id")
        print(f"Cleared existing feeds.")

        authors = await conn.fetch(
            "SELECT id, name, orcid FROM authors WHERE is_faculty = TRUE"
        )
        print(f"Found {len(authors)} faculty authors.")

        inserted = 0
        for a in authors:
            # Feed 1: Name + Sabancı (primary, reduces false positives)
            url1 = build_name_sabancu_url(a["name"])
            await conn.execute(
                "INSERT INTO author_news_feeds (author_id, feed_url, feed_label) VALUES ($1, $2, $3)",
                a["id"], url1, "Google News – Name + Sabancı"
            )
            inserted += 1

            # Feed 2: ORCID-based (only if ORCID exists, zero false positives)
            if a["orcid"]:
                url2 = build_orcid_url(a["orcid"])
                await conn.execute(
                    "INSERT INTO author_news_feeds (author_id, feed_url, feed_label) VALUES ($1, $2, $3)",
                    a["id"], url2, "Google News – ORCID"
                )
                inserted += 1

        print(f"Inserted {inserted} feeds for {len(authors)} authors.")
    await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
