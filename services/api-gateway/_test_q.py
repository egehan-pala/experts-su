import asyncio, asyncpg, os, json
from dotenv import load_dotenv
load_dotenv()

DSN = f"postgresql://{os.getenv('DB_USER','postgres')}:{os.getenv('DB_PASSWORD','password')}@{os.getenv('DB_HOST','localhost')}:{os.getenv('DB_PORT','5432')}/{os.getenv('DB_NAME','experts_su')}"

async def main():
    conn = await asyncpg.connect(DSN)
    row = await conn.fetchrow("SELECT topics_json FROM publications WHERE topics_json IS NOT NULL LIMIT 1")
    if row and row['topics_json']:
        data = json.loads(row['topics_json']) if isinstance(row['topics_json'], str) else row['topics_json']
        if isinstance(data, list) and data:
            with open('_sample_topic.json','w') as f:
                json.dump(data[0], f, indent=2, default=str)
    row2 = await conn.fetchrow("SELECT authorships_json FROM publications WHERE authorships_json IS NOT NULL LIMIT 1")
    if row2 and row2['authorships_json']:
        data2 = json.loads(row2['authorships_json']) if isinstance(row2['authorships_json'], str) else row2['authorships_json']
        if isinstance(data2, list) and data2:
            with open('_sample_authorship.json','w') as f:
                json.dump(data2[0], f, indent=2, default=str)
    await conn.close()
    print("DONE - check _sample_topic.json and _sample_authorship.json")

asyncio.run(main())
