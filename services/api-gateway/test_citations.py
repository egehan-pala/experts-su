import asyncio
import httpx
import json

async def fetch_author_citations(author_id):
    # We want to know:
    # 1. Who cites this author most often (incoming citations)
    # 2. Who this author cites most often (outgoing citations)
    # OpenAlex API makes this tricky to do natively without aggregate queries.
    
    # 1. Total works citing this author
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://api.openalex.org/works?filter=cites.author.id:{author_id}&per-page=1")
        if resp.status_code == 200:
            data = resp.json()
            print(f"Total works citing this author (global via OpenAlex API): {data.get('meta', {}).get('count')}")
            
try:
    asyncio.run(fetch_author_citations('A5072423303'))
except Exception as e:
    print(e)
