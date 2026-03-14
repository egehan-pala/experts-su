import asyncpg
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

async def run():
    try:
        conn = await asyncpg.connect(
            user=os.getenv('DB_USER', 'postgres'),
            password=os.getenv('DB_PASSWORD', 'password'),
            host=os.getenv('DB_HOST', 'localhost'),
            port=os.getenv('DB_PORT', '5432'),
            database=os.getenv('DB_NAME', 'experts_su')
        )
        
        author_id = 'A5073362191'
        
        with open('final_report.txt', 'w', encoding='utf-8') as f:
            # Author
            row = await conn.fetchrow("SELECT id, name FROM authors WHERE id = $1", author_id)
            f.write(f"AUTHOR: {row}\n")
            
            # Pubs
            pubs = await conn.fetch(\"\"\"
                SELECT p.id, p.title, p.publication_date 
                FROM publications p 
                JOIN author_publications ap ON p.id = ap.publication_id 
                WHERE ap.author_id = $1
                ORDER BY p.publication_date DESC NULLS LAST
            \"\"\", author_id)
            f.write(f"TOTAL PUBS: {len(pubs)}\n")
            for p in pubs[:20]:
                f.write(f"{p['publication_date']} | {p['title']}\n")
                
        await conn.close()
    except Exception as e:
        with open('final_report.txt', 'w', encoding='utf-8') as f:
            f.write(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(run())
