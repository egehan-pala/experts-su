import asyncio, asyncpg, os, json
from dotenv import load_dotenv
load_dotenv()

DSN = f"postgresql://{os.getenv('DB_USER','postgres')}:{os.getenv('DB_PASSWORD','password')}@{os.getenv('DB_HOST','localhost')}:{os.getenv('DB_PORT','5432')}/{os.getenv('DB_NAME','experts_su')}"

async def main():
    conn = await asyncpg.connect(DSN)
    r1 = await conn.fetchrow("SELECT count(*) as total, count(authorships_json) as with_auth FROM publications")
    
    rows = await conn.fetch("""
        SELECT p.authorships_json FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id = 'A5072423303' AND p.authorships_json IS NOT NULL
        LIMIT 3
    """)
    
    coauth_map = {}
    for r in rows:
        auths = json.loads(r['authorships_json']) if isinstance(r['authorships_json'], str) else r['authorships_json']
        for a in auths:
            name = a.get('author_name') or a.get('raw_name')
            if not name:
                continue
            aid = a.get('author_id')
            # Skip self - aid could be full URL or short id or None
            if aid and isinstance(aid, str) and ('A5072423303' in aid):
                continue
            coauth_map[name] = coauth_map.get(name, 0) + 1
    
    items = sorted(coauth_map.items(), key=lambda x: x[1], reverse=True)[:10]
    with open('_diag2.txt','w') as f:
        f.write(f"Total: {r1['total']}, With auth: {r1['with_auth']}\n")
        f.write(f"Pubs checked: {len(rows)}\n")
        f.write(f"\nTop coauthors:\n")
        for n, c in items:
            f.write(f"  {n}: {c}\n")
    
    await conn.close()

asyncio.run(main())
