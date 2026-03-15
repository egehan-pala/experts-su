import asyncio
import asyncpg
import os
from dotenv import load_dotenv

async def main():
    load_dotenv()
    dsn = f"postgresql://{os.getenv('DB_USER')}:{os.getenv('DB_PASSWORD')}@{os.getenv('DB_HOST')}:{os.getenv('DB_PORT')}/{os.getenv('DB_NAME')}"
    conn = await asyncpg.connect(dsn)
    
    print("--- TABLES ---")
    tables = await conn.fetch("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'author_%_yearly'")
    for t in tables:
        print(f"Table: {t['table_name']}")
        columns = await conn.fetch(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{t['table_name']}'")
        for c in columns:
            print(f"  {c['column_name']} ({c['data_type']})")
            
    await conn.close()

if __name__ == "__main__":
    asyncio.run(main())
