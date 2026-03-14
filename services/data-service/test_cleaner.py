import asyncio
import json
from data_service.config import get_settings
from data_service.clients.supabase import Database
from data_service.etl.cleaners import parse_staging_authors, clean_authors

async def main():
    settings = get_settings()
    db = Database(settings)
    await db.connect()
    
    # Load match map
    with open("data_exports/match_map.json") as f:
        match_map = json.load(f)
        
    # Get all staging authors
    batch = await db.fetch("SELECT source_id, payload, source_hash, fetched_at FROM stg_authors")
    parsed = parse_staging_authors(batch)
    
    cleaned, id_remap = clean_authors(parsed, match_map)
    
    print(f"Parsed {len(parsed)} staging authors.")
    print(f"Cleaned {len(cleaned)} authors.")
    
    for c in cleaned:
        if "Müftüler" in c.name or "Tanaltay" in c.name:
            print(f"KEPT: {c.name} ({c.id}) - Works: {c.works_count}")
    
    unmatched = [a for a in parsed if a.id.split("/")[-1] not in match_map]
    print(f"Unmatched: {len(unmatched)}")
    
    await db.disconnect()

asyncio.run(main())
