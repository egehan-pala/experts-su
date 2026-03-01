"""Backfill venue data from stg_publications raw payloads."""
import asyncio, asyncpg, os, json
from dotenv import load_dotenv
load_dotenv()

DSN = f"postgresql://{os.getenv('DB_USER','postgres')}:{os.getenv('DB_PASSWORD','password')}@{os.getenv('DB_HOST','localhost')}:{os.getenv('DB_PORT','5432')}/{os.getenv('DB_NAME','experts_su')}"

async def main():
    conn = await asyncpg.connect(DSN)
    
    # Read all staged publications
    rows = await conn.fetch("SELECT payload FROM stg_publications")
    print(f"Staged publications: {len(rows)}")
    
    updates = []
    for row in rows:
        payload = json.loads(row["payload"])
        work_id = payload.get("id", "").split("/")[-1]
        if not work_id:
            continue
        
        venue_name = None
        venue_id = None
        venue_type = None
        
        # Try host_venue first
        hv = payload.get("host_venue")
        if hv:
            venue_name = hv.get("display_name")
            venue_id = hv.get("id")
            venue_type = hv.get("type")
        
        # Fall back to primary_location.source
        if not venue_name:
            pl = payload.get("primary_location")
            if pl:
                src = pl.get("source") or {}
                venue_name = src.get("display_name")
                venue_id = venue_id or src.get("id")
                venue_type = venue_type or src.get("type")
        
        if venue_name:
            updates.append((work_id, venue_name, venue_id, venue_type))
    
    print(f"Publications with venue data: {len(updates)}")
    
    # Batch update
    updated = 0
    for wid, vname, vid, vtype in updates:
        result = await conn.execute(
            "UPDATE publications SET venue=$1, venue_id=$2, venue_type=$3 WHERE id=$4 AND venue IS NULL",
            vname, vid, vtype, wid
        )
        if "UPDATE 1" in result:
            updated += 1
    
    print(f"Rows updated: {updated}")
    await conn.close()

asyncio.run(main())
