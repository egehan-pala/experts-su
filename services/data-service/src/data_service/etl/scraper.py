import asyncio
import re
import httpx
from bs4 import BeautifulSoup
from typing import Dict, List, Optional
import logging

from ..clients.supabase import Database

logger = logging.getLogger("data_service.etl.scraper")

FACULTY_URLS = [
    # FENS
    "https://fens.sabanciuniv.edu/tr/faculty-members?group_id=281%2C282%2C285%2C301%2C302%2C303%2C681%2C701%2C721%2C821%2C841%2C862%2C921%2C941%2C981%2C1081&prg_code=",
    # FASS
    "https://fass.sabanciuniv.edu/tr/ogretim-uyeleri?group_id=221",
    # SBS
    "https://sbs.sabanciuniv.edu/tr/faculty-members-and-administrative-staff"
]

def normalize_name(name: str) -> str:
    """Normalize name for easier matching: lowercase, remove special turkish chars."""
    if not name:
        return ""
    name = name.lower()
    mapping = str.maketrans("çğıöşü", "cgiosu")
    name = name.translate(mapping)
    # Remove titles
    name = re.sub(r'^(dr\.|prof\.|doc\.|yrd\.|doç\.|ogretim|uyesi|gorevlisi)\s*', '', name)
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
        elif url.startswith("/"):
            # Assume base domain matches the source if relative
            # But here we return path and let caller handle domain mapping if needed
            pass 
        return url
    return None

async def scrape_and_update_images(db: Database) -> None:
    """Scrape faculty images and update the database."""
    logger.info("Starting image scraping...")
    
    # 1. Fetch all existing authors from DB
    authors = await db.fetch("SELECT id, name FROM authors")
    logger.info(f"Loaded {len(authors)} authors from database.")
    
    # Create a map of normalized_name -> author_id
    name_map = {}
    for row in authors:
        norm = normalize_name(row['name'])
        if norm:
            name_map[norm] = row['id']
        
    # Reduced timeout to 10.0 seconds to fail fast
    client = httpx.AsyncClient(verify=False, follow_redirects=True, timeout=10.0)
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }

    updated_count = 0
    
    print(f"Scraping started. Checking {len(FACULTY_URLS)} faculties...")

    for url in FACULTY_URLS:
        # Determine local filename based on URL hints
        local_file = None
        if "fens" in url: local_file = "fens.html"
        elif "fass" in url: local_file = "fass.html"
        elif "sbs" in url: local_file = "sbs.html"
        
        content = None
        
        # 1. Try Local File
        if local_file:
            import os
            # Check in project root (../../..) from this file's perspective is hard, assume passed paths or check cwd
            # We are running from project root usually
            possible_paths = [local_file, f"services/data-service/{local_file}", f"/Users/berke/experts-su-berke/{local_file}"]
            for p in possible_paths:
                if os.path.exists(p):
                    print(f"📂 Found local file: {p}")
                    try:
                        with open(p, "r", encoding="utf-8") as f:
                            content = f.read()
                        logger.info(f"Loaded {len(content)} bytes from {p}")
                        break
                    except Exception as e:
                        print(f"Error reading {p}: {e}")
        
        # 2. Try Network if no local file
        if not content:
            logger.info(f"Scraping {url}...")
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
            # 1. Try 'card-wrapper' (FENS)
            cards = soup.find_all(class_="card-wrapper")
            
            # 2. Try 'views-row' (FASS / Drupal default)
            if not cards:
                cards = soup.find_all(class_="views-row")
                
            # 3. Try 'col...' generic grids if typical structures
            if not cards:
                cards = soup.find_all(class_=re.compile(r"col-"))

            logger.info(f"Found {len(cards)} potential items on {url}")
            print(f"   Found {len(cards)} potential profiles.")
            
            domain_match = re.search(r"(https?://[^/]+)", url)
            base_domain = domain_match.group(1) if domain_match else "https://www.sabanciuniv.edu"

            for card in cards:
                # Naive extract text as name
                # Look for typical name containers: h3, h4, .title, .card-title, .views-field-title
                name_elem = card.find(class_=re.compile(r"title|name|field-content"))
                if not name_elem:
                   # Try finding just H tags
                   name_elem = card.find(["h3", "h4", "strong"])
                
                if not name_elem:
                    continue
                    
                raw_name = name_elem.get_text(strip=True)
                norm_name = normalize_name(raw_name)
                
                # Image finding
                img_url = None
                
                # A. Background image style
                figure = card.find(class_=re.compile(r"picture|image|photo"))
                if figure and figure.get('style'):
                     img_url = extract_image_url(figure.get('style'))
                
                # B. Img tag
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

                if img_url or areas:
                    if norm_name in name_map:
                        author_id = name_map[norm_name]
                        # Update DB
                        # We use COALESCE so if a field is not found in this pass, we don't overwrite existing with NULL
                        await db.execute(
                            "UPDATE authors SET image_url = COALESCE($1, image_url), areas_of_interest = COALESCE($2, areas_of_interest) WHERE id = $3",
                            img_url, areas, author_id
                        )
                        updated_count += 1
                        logger.info(f"Updated {raw_name} -> img:{bool(img_url)}, areas:{bool(areas)}")
            
            print(f"   Processed {url}.")
                    
        except Exception as e:
            logger.error(f"Parse error {url}: {e}")
            print(f"❌ Error parsing content for {url}")
            
    await client.aclose()
    logger.info(f"Scraping completed. Updated {updated_count} authors total.")
    print(f"\nDone! Updated {updated_count} authors.")
