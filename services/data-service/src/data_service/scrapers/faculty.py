
import asyncio
import re
from typing import List, Dict, Optional
import httpx
from bs4 import BeautifulSoup



async def scrape_faculty(url: str, faculty_label: str, client: httpx.AsyncClient) -> List[Dict[str, str]]:
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
        normalized_title = job_title.lower()
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
        image_url = ""
        figure = card.find('figure', class_='card-picture')
        if figure and figure.get('style'):
            style = figure['style']
            match = re.search(r"url\(['\"]?(.*?)['\"]?\)", style)
            if match:
                src = match.group(1)
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

        # Email
        email_tag = card.find('span', class_='card-mail')
        email = ""
        if email_tag:
            for dot_span in email_tag.find_all('span', class_='dot'):
                dot_span.replace_with('.')
            for at_span in email_tag.find_all('span', class_='at'):
                at_span.replace_with('@')
            for icon in email_tag.find_all('i'):
                icon.decompose()
            email = email_tag.get_text(strip=True).replace(" ", "")

        faculty_list.append({
            "name": name,
            "image_url": image_url,
            "email": email,
            "phone": phone,
            "title": job_title,
            "dept": faculty_label, # Use the passed faculty label
            "source": url
        })

    return faculty_list

async def scrape_all_faculty() -> List[Dict[str, str]]:
    configs = [
        ("https://fens.sabanciuniv.edu/tr/faculty-members?group_id=281%2C282%2C285%2C301%2C302%2C303%2C681%2C701%2C721%2C821%2C841%2C862%2C921%2C941%2C981%2C1081&prg_code=", "FENS"),
        ("https://fass.sabanciuniv.edu/tr/ogretim-uyeleri?group_id=221", "FASS"),
        ("https://sbs.sabanciuniv.edu/tr/faculty-members-and-administrative-staff", "SBS")
    ]
    
    async with httpx.AsyncClient(verify=False) as client:
        results = await asyncio.gather(*[scrape_faculty(url, label, client) for url, label in configs])
    
    all_faculty = []
    for res in results:
        all_faculty.extend(res)
        
    return all_faculty

if __name__ == "__main__":
    items = asyncio.run(scrape_all_faculty())
    print(f"Found {len(items)} faculty members.")
    for item in items[:5]:
        print(item)
