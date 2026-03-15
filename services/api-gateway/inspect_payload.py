import asyncio
import json
import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()
DB_DSN = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'password')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'experts_su')}"

async def main():
    conn = await asyncpg.connect(DB_DSN)
    row = await conn.fetchrow("SELECT payload FROM stg_publications LIMIT 1;")
    if row:
        payload = json.loads(row['payload'])
        counts = payload.get('counts_by_year', [])
        print(f"Counts by year: {json.dumps(counts, indent=2)}")
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
