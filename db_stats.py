
import asyncio
import os
import asyncpg
from dotenv import load_dotenv

load_dotenv("services/data-service/.env")

async def get_stats():
    dsn = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'password')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'experts_su')}"
    try:
        conn = await asyncpg.connect(dsn)
        
        tables = ["authors", "publications", "stg_authors", "stg_publications", "publication_topics", "coauthor_edges"]
        print(f"{'Table':<25} | {'Row Count':<10}")
        print("-" * 40)
        
        for table in tables:
            try:
                row = await conn.fetchrow(f"SELECT COUNT(*) FROM {table}")
                count = row[0]
                print(f"{table:<25} | {count:<10}")
            except Exception as e:
                print(f"{table:<25} | Error: {e}")
                
        await conn.close()
    except Exception as e:
        print(f"Connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(get_stats())
