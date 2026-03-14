import asyncio
from data_service.etl.name_matcher import match_faculty_to_openalex
from data_service.config import get_settings
from data_service.clients.openalex import OpenAlexClient
import httpx

async def main():
    settings = get_settings()
    client = OpenAlexClient(settings, httpx.AsyncClient())
    
    auth1 = await client.fetch_author_by_id("A5090349901")
    auth2 = await client.fetch_author_by_id("A5089700850")
    
    faculty_list = [
        {"name": "Meltem Müftüler-Baç", "title": "Prof", "email": "meltem@sabanciuniv.edu"},
        {"name": "Altuğ Tanaltay", "title": "Asst", "email": "altug@sabanciuniv.edu"}
    ]
    
    result = match_faculty_to_openalex(faculty_list, [auth1, auth2])
    print("Matched:")
    for m in result["matched"]:
        print(f"  {m['name']} -> {m.get('openalex_id')}")
    print("Unmatched:")
    for u in result["unmatched"]:
        print(f"  {u['name']}")

asyncio.run(main())
