import asyncio
import httpx

async def main():
    author_id = 'A5072423303'
    async with httpx.AsyncClient() as client:
        print("Fetching researchers who cite this author...")
        resp = await client.get(
            f"https://api.openalex.org/works?filter=cites.author.id:{author_id}&group_by=authorships.author.id",
            headers={"User-Agent": "ExpertsSU (mailto:test@example.com)"}
        )
        print("Status Code:", resp.status_code)
        if resp.status_code == 200:
            data = resp.json()
            groups = data.get('group_by', [])
            print(f"Top 5 citing authors:")
            for g in groups[:5]:
                print(f"  {g['key_display_name']} ({g['key']}): {g['count']} citations")
        else:
            print("Error text:", resp.text)
            
asyncio.run(main())
