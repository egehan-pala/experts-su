from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
import os
from dotenv import load_dotenv
from typing import List, Optional
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="Experts@SU API", version="1.0.0")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database
DB_DSN = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'password')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'experts_su')}"

class Database:
    def __init__(self):
        self.pool = None

    async def connect(self):
        self.pool = await asyncpg.create_pool(DB_DSN)

    async def disconnect(self):
        if self.pool:
            await self.pool.close()

db = Database()

@app.on_event("startup")
async def startup():
    await db.connect()

@app.on_event("shutdown")
async def shutdown():
    await db.disconnect()

# Models
class Author(BaseModel):
    id: str
    name: str
    dept: Optional[str] = None
    orcid: Optional[str] = None
    image_url: Optional[str] = None
    pub_count: Optional[int] = 0

class Publication(BaseModel):
    id: str
    title: str
    year: Optional[int]
    citations: Optional[int]
    venue: Optional[str]
    pdf_url: Optional[str] = None

# Endpoints
@app.get("/")
async def root():
    return {"message": "Experts@SU API is running"}

@app.get("/authors/search", response_model=List[Author])
async def search_authors(q: str = Query(..., min_length=2)):
    """Search authors by name."""
    query = """
        SELECT id, name, dept, orcid, image_url
        FROM authors 
        WHERE name ILIKE $1 
        ORDER BY name 
        LIMIT 20
    """
    rows = await db.pool.fetch(query, f"%{q}%")
    return [Author(id=r['id'], name=r['name'], dept=r['dept'], orcid=r['orcid'], image_url=r['image_url']) for r in rows]

@app.get("/authors/{author_id}", response_model=Author)
async def get_author(author_id: str):
    """Get author details."""
    query = "SELECT id, name, dept, orcid, image_url FROM authors WHERE id = $1"
    row = await db.pool.fetchrow(query, author_id)
    if not row:
        raise HTTPException(status_code=404, detail="Author not found")
    return Author(id=row['id'], name=row['name'], dept=row['dept'], orcid=row['orcid'], image_url=row['image_url'])

@app.get("/authors/{author_id}/publications", response_model=List[Publication])
async def get_author_publications(author_id: str):
    """Get publications for an author."""
    query = """
        SELECT p.id, p.title, p.year, p.citations, p.venue
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id = $1
        ORDER BY p.year DESC, p.citations DESC
        LIMIT 100
    """
    rows = await db.pool.fetch(query, author_id)
    import urllib.parse
    return [
        Publication(
            id=r['id'], 
            title=r['title'], 
            year=r['year'], 
            citations=r['citations'], 
            venue=r['venue'],
            # Simulating a mapped PDF URL. In a real scenario, this would come from the DB.
            pdf_url=f"https://scholar.google.com/scholar?q={urllib.parse.quote(r['title'])}"
        )
        for r in rows
    ]

@app.get("/authors", response_model=dict)
async def get_authors(page: int = Query(1, ge=1), limit: int = Query(12, ge=1, le=100)):
    """Get all authors with pagination."""
    offset = (page - 1) * limit
    
    # 1. Get total count
    count_query = "SELECT COUNT(*) FROM authors"
    total_count = await db.pool.fetchval(count_query)
    
    # 2. Get paginated data
    # Sort order: 
    # - Has Image (image_url IS NOT NULL) -> First
    # - Publication Count (desc) -> Second
    # - Alphabetical -> Third
    query = """
        SELECT a.id, a.name, a.dept, a.orcid, a.image_url, COALESCE(SUM(amy.pub_count), 0) as total_pubs
        FROM authors a
        LEFT JOIN author_metrics_yearly amy ON a.id = amy.author_id
        GROUP BY a.id, a.name, a.dept, a.orcid, a.image_url
        ORDER BY 
            total_pubs DESC NULLS LAST,
            (a.image_url IS NOT NULL) DESC,
            a.name ASC
        LIMIT $1 OFFSET $2
    """
    rows = await db.pool.fetch(query, limit, offset)
    
    authors = [
         Author(id=r['id'], name=r['name'], dept=r['dept'], orcid=r['orcid'], image_url=r['image_url'], pub_count=r['total_pubs']) 
         for r in rows
    ]
    
    return {
        "data": authors,
        "meta": {
            "page": page,
            "limit": limit,
            "total_items": total_count,
            "total_pages": (total_count + limit - 1) // limit
        }
    }

@app.get("/stats/top-authors", response_model=List[Author])
async def get_top_authors():
    """Get top authors by total publications."""
    query = """
        SELECT a.id, a.name, a.dept, a.orcid, a.image_url, SUM(amy.pub_count) as total_pubs
        FROM authors a
        LEFT JOIN author_metrics_yearly amy ON a.id = amy.author_id
        GROUP BY a.id, a.name, a.dept, a.orcid, a.image_url
        ORDER BY total_pubs DESC NULLS LAST
        LIMIT 12
    """
    rows = await db.pool.fetch(query)
    return [
         Author(id=r['id'], name=r['name'], dept=r['dept'], orcid=r['orcid'], image_url=r['image_url'], pub_count=r['total_pubs'] or 0) 
         for r in rows
    ]
