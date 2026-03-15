import asyncio
import re
import httpx
from bs4 import BeautifulSoup
from typing import Dict, List, Optional
import logging

from ..clients.supabase import Database

logger = logging.getLogger("data_service.etl.scraper")

FACULTY_URLS = [
    ("https://fens.sabanciuniv.edu/tr/faculty-members?group_id=281%2C282%2C285%2C301%2C302%2C303%2C681%2C701%2C721%2C821%2C841%2C862%2C921%2C941%2C981%2C1081&prg_code=", "FENS"),
    ("https://fass.sabanciuniv.edu/tr/ogretim-uyeleri?group_id=221", "FASS"),
    ("https://sbs.sabanciuniv.edu/tr/faculty-members-and-administrative-staff", "SBS")
]

def normalize_name(name: str) -> str:
    """Normalize name for easier matching: lowercase, remove special turkish chars."""
    if not name:
        return ""
    name = name.lower()
    mapping = str.maketrans("çğıöşü", "cgiosu")
    name = name.translate(mapping)
    # Remove titles
    name = re.sub(r'^(dr\.|prof\.|doc\.|yrd\.|doç\.|ogretim|uyesi|gorevlisi|rektör)\s*', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name

def extract_image_url(style_attr: str) -> Optional[str]:
    """Extract URL from background-image: url('...')"""
    if not style_attr:
        return None
    match = re.search(r"url\(['\"]?([^'\"]+)['\"]?\)", style_attr)
    if match:
        url = match.group(1)
        if url.startswith("//"):
            url = "https:" + url
        return url
    return None

async def scrape_and_update_images(db: Database) -> None:
    """Scrape faculty images and update the database."""
    logger.info("Starting faculty site scraping and sync...")
    
    # 1. Fetch all existing authors from DB
    authors = await db.fetch("SELECT id, name FROM authors")
    logger.info(f"Loaded {len(authors)} authors from database.")
    
    # Create a map of normalized_name -> author_id
    name_map = {}
    for row in authors:
        norm = normalize_name(row['name'])
        if norm:
            name_map[norm] = row['id']
        
    client = httpx.AsyncClient(verify=False, follow_redirects=True, timeout=15.0)
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    updated_count = 0
    
    print(f"Scraping started. Checking {len(FACULTY_URLS)} faculties...")

    for url, faculty_label in FACULTY_URLS:
        content = None
        logger.info(f"Scraping {url} as {faculty_label}...")
        print(f"Attemping to fetch: {url}")
        try:
            resp = await client.get(url, headers=headers)
            if resp.status_code != 200:
                logger.warning(f"Failed to fetch {url}: {resp.status_code}")
                print(f"❌ Failed ({resp.status_code})")
                continue
            content = resp.content
            print(f"✅ Connection successful! Parsing...")
        except Exception as e:
            logger.error(f"Error scraping {url}: {e}")
            print(f"❌ Error: Could not connect to {url}")
            continue
        
        if not content:
            continue

        try:
            soup = BeautifulSoup(content, 'html.parser')
            
            # Universal Strategy: Find ANYTHING that looks like a person card
            cards = soup.find_all(class_="card-wrapper")
            
            # 2. Try 'views-row' (FASS / Drupal default)
            if not cards:
                cards = soup.find_all(class_="views-row")
                
            # 3. Try 'col...' generic grids if typical structures
            if not cards:
                cards = soup.find_all(class_=re.compile(r"col-"))

            logger.info(f"Found {len(cards)} items for {faculty_label}")
            print(f"   Found {len(cards)} items.")
            
            domain_match = re.search(r"(https?://[^/]+)", url)
            base_domain = domain_match.group(1) if domain_match else "https://www.sabanciuniv.edu"

            for card in cards:
                # Look for typical name containers
                name_elem = card.find(class_=re.compile(r"title|name|field-content"))
                if not name_elem:
                   name_elem = card.find(["h3", "h4", "strong"])
                
                if not name_elem:
                    continue
                    
                raw_name = name_elem.get_text(strip=True)
                norm_name = normalize_name(raw_name)
                
                # Image finding
                img_url = None
                figure = card.find(class_=re.compile(r"picture|image|photo"))
                if figure and figure.get('style'):
                     img_url = extract_image_url(figure.get('style'))
                
                if not img_url:
                    img = card.find("img")
                    if img:
                        img_url = img.get('src') or img.get('data-src')

                if img_url and img_url.startswith("/"):
                    img_url = base_domain + img_url

                # Areas of interest finding
                areas = None
                all_text = card.get_text(separator=' ', strip=True)
                match = re.search(r"Araştırma Alanı\s*(.*?)(?=$|E-Posta|Email|Daha Fazla|Telefon|\[|\()", all_text, re.IGNORECASE | re.DOTALL)
                if match:
                    areas = match.group(1).replace(']', '').strip()
                    if len(areas) < 3:
                        areas = None

                # ALWAYS update dept if we match the author
                if norm_name in name_map:
                    author_id = name_map[norm_name]
                    # Update DB including dept
                    await db.execute(
                        "UPDATE authors SET image_url = COALESCE($1, image_url), areas_of_interest = COALESCE($2, areas_of_interest), dept = $3 WHERE id = $4",
                        img_url, areas, faculty_label, author_id
                    )
                    updated_count += 1
                    logger.info(f"Updated {raw_name} -> dept:{faculty_label}")
            
            print(f"   Processed {faculty_label}.")
                    
        except Exception as e:
            logger.error(f"Parse error {url}: {e}")
            print(f"❌ Error parsing content for {url}")
            
    await client.aclose()
    logger.info(f"Scraping completed. Updated {updated_count} authors total.")
    print(f"\nDone! Updated {updated_count} authors.")
