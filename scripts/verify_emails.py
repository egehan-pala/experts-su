
import asyncio
import sys
import os
sys.path.append(os.getcwd())
from data_service.scrapers.faculty import scrape_all_faculty

async def verify():
    items = await scrape_all_faculty()
    print(f"Total: {len(items)}")
    for item in items:
        email = item.get('email', '')
        if '@' not in email or '<' in email or '>' in email:
             print(f"SUSPICIOUS EMAIL: {item['name']} -> {email}")
    
    # Check phone
    print("Sample Phone Numbers:")
    for item in items[:5]:
        print(f"{item['name']}: {item.get('phone')}")

if __name__ == "__main__":
    asyncio.run(verify())
