
import asyncio
import re
from typing import List, Dict, Optional
import httpx
from bs4 import BeautifulSoup



async def scrape_faculty(url: str, client: httpx.AsyncClient) -> List[Dict[str, str]]:
    """Scrape faculty members from a Sabanci faculty page."""
    try:
        response = await client.get(url, timeout=30.0)
        response.raise_for_status()
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return []

    soup = BeautifulSoup(response.text, 'html.parser')
    faculty_list = []

    # Select all card wrappers
    cards = soup.find_all('div', class_='card-wrapper')
    
    for card in cards:
        # Job Title
        job_tag = card.find('span', class_='card-job')
        if not job_tag:
            continue
        
        job_title = job_tag.get_text(strip=True)
        # Filter for Faculty Members
        # Known titles: "Öğretim Üyesi", "Faculty Member", "Emeritus Öğretim Üyesi"
        # We want to be inclusive of faculty but exclude staff/research assistants if desired.
        normalized_title = job_title.lower()
        # Inclusive keywords for academic positions
        # "öğretim" covers Üyesi, Görevlisi
        # "araştır" covers Araştırmacı, Araştırma Görevlisi, Postdoc (Doktora Sonrası)
        # "dekan" covers Dean, Vice Dean
        academic_keywords = [
            "öğretim", "faculty", "araştır", "research", 
            "instructor", "lecturer", "professor", 
            "dekan", "dean", "doktora sonrası", "post-doc",
            "emeritus"
        ]
        
        if not any(k in normalized_title for k in academic_keywords):
             continue

        # Name
        name_tag = card.find('span', class_='card-title')
        name = name_tag.get_text(strip=True) if name_tag else "Unknown"

        # Image
        # <figure class="card-picture" style="background-image:url('...')"></figure>
        image_url = ""
        figure = card.find('figure', class_='card-picture')
        if figure and figure.get('style'):
            style = figure['style']
            # Match url('...') or url("...") or url(...)
            match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
            if match:
                src = match.group(1)
                # Handle relative URLs (they start with // or /)
                if src.startswith('//'):
                    image_url = "https:" + src
                elif src.startswith('/'):
                    image_url = "https://www.sabanciuniv.edu" + src
                else:
                    image_url = src

        # Phone
        phone_tag = card.find('span', class_='card-phone')
        phone = ""
        if phone_tag:
            phone = phone_tag.get_text(strip=True)
            # Remove purely whitespace/icon artifacts if any
            # The Example: (216) 483 9541
            # Usually clean enough.

        # Email
        email_tag = card.find('span', class_='card-mail')
        email = ""
        if email_tag:
            # Create a copy to avoid modifying the original tree if needed, though here it's fine.
            # We want to replace specific spans with their text equivalents
            # <span class="dot"></span> -> "."
            for dot_span in email_tag.find_all('span', class_='dot'):
                dot_span.replace_with('.')
            
            # <span class="at"></span> -> "@"
            for at_span in email_tag.find_all('span', class_='at'):
                at_span.replace_with('@')
                
            # Remove icons like <i class="fas fa-envelope"></i>
            for icon in email_tag.find_all('i'):
                icon.decompose()
            
            # Now extract the text
            email = email_tag.get_text(strip=True).replace(" ", "")

        faculty_list.append({
            "name": name,
            "image_url": image_url,
            "email": email,
            "phone": phone,
            "title": job_title,
            "source": url
        })

    return faculty_list

async def scrape_all_faculty() -> List[Dict[str, str]]:
    urls = [
        "https://fens.sabanciuniv.edu/tr/faculty-members?group_id=281%2C282%2C285%2C301%2C302%2C303%2C681%2C701%2C721%2C821%2C841%2C862%2C921%2C941%2C981%2C1081&prg_code=",
        "https://fass.sabanciuniv.edu/tr/ogretim-uyeleri?group_id=221",
        "https://sbs.sabanciuniv.edu/tr/faculty-members-and-administrative-staff"
    ]
    
    async with httpx.AsyncClient(verify=False) as client:
        results = await asyncio.gather(*[scrape_faculty(url, client) for url in urls])
    
    all_faculty = []
    for res in results:
        all_faculty.extend(res)
        
    return all_faculty

if __name__ == "__main__":
    # Test run
    items = asyncio.run(scrape_all_faculty())
    print(f"Found {len(items)} faculty members.")
    for item in items[:5]:
        print(item)
