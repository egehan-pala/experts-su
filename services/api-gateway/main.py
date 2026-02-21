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

# Sentence Transformer model for semantic search
embedding_model = None

@app.on_event("startup")
async def startup():
    global embedding_model
    await db.connect()
    # Load embedding model for semantic search (lazy load - only if sentence_transformers available)
    try:
        from sentence_transformers import SentenceTransformer
        embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        print("✅ Loaded sentence transformer model for semantic search")
    except ImportError:
        print("⚠️ sentence-transformers not installed - semantic search disabled")
        embedding_model = None

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
    email: Optional[str] = None
    phone: Optional[str] = None
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
        SELECT a.id, a.name, a.dept, a.orcid, a.image_url, a.email, a.phone, COALESCE(SUM(amy.pub_count), 0) as total_publications
        FROM authors a
        LEFT JOIN author_metrics_yearly amy ON a.id = amy.author_id
        WHERE a.name ILIKE $1 AND a.is_faculty = TRUE
        GROUP BY a.id, a.name, a.dept, a.orcid, a.image_url, a.email, a.phone
        HAVING COALESCE(SUM(amy.pub_count), 0) > 0
        ORDER BY total_publications DESC, a.name
        LIMIT 20
    """
    rows = await db.pool.fetch(query, f"%{q}%")
    return [
        Author(
            id=r['id'], 
            name=r['name'], 
            dept=r['dept'], 
            orcid=r['orcid'], 
            image_url=r['image_url'],
            email=r['email'],
            phone=r['phone'],
            pub_count=r['total_publications']
        ) 
        for r in rows
    ]

@app.get("/authors/{author_id}", response_model=Author)
async def get_author(author_id: str):
    """Get author details."""
    query = "SELECT id, name, dept, orcid, image_url, email, phone FROM authors WHERE id = $1"
    row = await db.pool.fetchrow(query, author_id)
    if not row:
        raise HTTPException(status_code=404, detail="Author not found")
    return Author(id=row['id'], name=row['name'], dept=row['dept'], orcid=row['orcid'], image_url=row['image_url'], email=row['email'], phone=row['phone'])

@app.get("/authors/{author_id}/publications", response_model=List[Publication])
async def get_author_publications(author_id: str):
    """Get all publications for an author."""
    query = """
        SELECT p.id, p.title, p.year, p.citations, p.venue, p.pdf_url
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id = $1
        ORDER BY p.year DESC, p.citations DESC
    """
    rows = await db.pool.fetch(query, author_id)
    return [
        Publication(
            id=r['id'], 
            title=r['title'], 
            year=r['year'], 
            citations=r['citations'], 
            venue=r['venue'],
            pdf_url=r['pdf_url']
        )
        for r in rows
    ]

@app.get("/authors", response_model=dict)
async def get_authors(page: int = Query(1, ge=1), limit: int = Query(12, ge=1, le=100)):
    """Get all authors with pagination."""
    offset = (page - 1) * limit
    
    # 1. Get total count
    count_query = """
        SELECT COUNT(DISTINCT a.id)
        FROM authors a
        JOIN author_metrics_yearly amy ON a.id = amy.author_id
        GROUP BY a.id
        HAVING SUM(amy.pub_count) > 0
    """
    # Note: The above count query returns a row for each author. We need the count of rows.
    # Alternatively, simplistic count of authors who have ANY metric entry with pub_count > 0
    count_query = """
        SELECT COUNT(*)
        FROM (
            SELECT a.id
            FROM authors a
            JOIN author_metrics_yearly amy ON a.id = amy.author_id
            WHERE a.is_faculty = TRUE
            GROUP BY a.id
            HAVING SUM(amy.pub_count) > 0
        ) as sub
    """
    total_count = await db.pool.fetchval(count_query)
    
    # 2. Get paginated data
    # Sort order: 
    # - Has Image (image_url IS NOT NULL) -> First
    # - Publication Count (desc) -> Second
    # - Alphabetical -> Third
    query = """
        SELECT a.id, a.name, a.dept, a.orcid, a.image_url, a.email, a.phone, COALESCE(SUM(amy.pub_count), 0) as total_pubs
        FROM authors a
        LEFT JOIN author_metrics_yearly amy ON a.id = amy.author_id
        WHERE a.is_faculty = TRUE
        GROUP BY a.id, a.name, a.dept, a.orcid, a.image_url, a.email, a.phone
        HAVING COALESCE(SUM(amy.pub_count), 0) > 0
        ORDER BY 
            total_pubs DESC NULLS LAST,
            (a.image_url IS NOT NULL) DESC,
            a.name ASC
        LIMIT $1 OFFSET $2
    """
    rows = await db.pool.fetch(query, limit, offset)
    
    authors = [
         Author(id=r['id'], name=r['name'], dept=r['dept'], orcid=r['orcid'], image_url=r['image_url'], email=r['email'], phone=r['phone'], pub_count=r['total_pubs']) 
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
    """Get top faculty experts by total publications."""
    query = """
        SELECT a.id, a.name, a.dept, a.orcid, a.image_url, SUM(amy.pub_count) as total_pubs
        FROM authors a
        LEFT JOIN author_metrics_yearly amy ON a.id = amy.author_id
        WHERE a.is_faculty = TRUE
        GROUP BY a.id, a.name, a.dept, a.orcid, a.image_url
        ORDER BY total_pubs DESC NULLS LAST
        LIMIT 12
    """
    rows = await db.pool.fetch(query)
    return [
         Author(id=r['id'], name=r['name'], dept=r['dept'], orcid=r['orcid'], image_url=r['image_url'], pub_count=r['total_pubs'] or 0) 
         for r in rows
    ]

# Visualization Models
class YearlyMetric(BaseModel):
    year: int
    pub_count: int
    citations: int

class TopicStat(BaseModel):
    name: str
    count: int

class NetworkNode(BaseModel):
    id: str
    name: str
    val: int  # weight/size
    image_url: Optional[str] = None

class NetworkLink(BaseModel):
    source: str
    target: str
    value: int

class NetworkGraph(BaseModel):
    nodes: List[NetworkNode]
    links: List[NetworkLink]

# Visualization Endpoints

@app.get("/authors/{author_id}/metrics", response_model=List[YearlyMetric])
async def get_author_metrics(author_id: str):
    """Get yearly publication and citation counts for an author."""
    # We can get this from author_metrics_yearly
    query = """
        SELECT year, pub_count, citations_year
        FROM author_metrics_yearly
        WHERE author_id = $1
        ORDER BY year ASC
    """
    rows = await db.pool.fetch(query, author_id)
    return [
        YearlyMetric(year=r['year'], pub_count=r['pub_count'], citations=r['citations_year'])
        for r in rows
    ]

@app.get("/authors/{author_id}/topics", response_model=List[TopicStat])
async def get_author_topics(author_id: str):
    """Get top topics for an author based on their publications."""
    query = """
        SELECT t.name, COUNT(*) as count
        FROM topics t
        JOIN publication_topics pt ON t.id = pt.topic_id
        JOIN author_publications ap ON pt.publication_id = ap.publication_id
        WHERE ap.author_id = $1
        GROUP BY t.name
        ORDER BY count DESC
        LIMIT 20
    """
    rows = await db.pool.fetch(query, author_id)
    return [
        TopicStat(name=r['name'], count=r['count'])
        for r in rows
    ]

@app.get("/authors/{author_id}/network", response_model=NetworkGraph)
async def get_author_network(author_id: str):
    """Get co-authorship network for an author."""
    # 1. Get edges where this author is involved (Core set)
    # Filter by threshold >= 5 contributions
    query_edges = """
        SELECT coauthor_id, edge_weight
        FROM coauthor_edges
        WHERE author_id = $1 AND edge_weight >= 5
        ORDER BY edge_weight DESC
        LIMIT 50
    """
    edges_rows = await db.pool.fetch(query_edges, author_id)
    
    # If no connections, return empty
    if not edges_rows:
        return NetworkGraph(nodes=[], links=[])

    # 2. Get details for the author and co-authors
    coauthor_ids = [r['coauthor_id'] for r in edges_rows]
    all_ids = [author_id] + coauthor_ids
    
    query_nodes = """
        SELECT id, name, image_url, 
               (SELECT COALESCE(SUM(pub_count),0) FROM author_metrics_yearly WHERE author_id = authors.id) as total_pubs
        FROM authors
        WHERE id = ANY($1::text[])
    """
    nodes_rows = await db.pool.fetch(query_nodes, all_ids)
    nodes_map = {r['id']: r for r in nodes_rows}
    
    # Construct formatting for react-force-graph
    nodes = []
    links = []
    
    # Add nodes (Center + Co-authors)
    for row in nodes_rows:
        nodes.append(NetworkNode(
            id=row['id'], 
            name=row['name'], 
            val=row['total_pubs'] or 5,
            image_url=row['image_url']
        ))
        
    # Add direct links (Center -> Co-authors)
    for r in edges_rows:
        links.append(NetworkLink(source=author_id, target=r['coauthor_id'], value=r['edge_weight']))
            
    # 3. Fetch mesh edges (Co-author <-> Co-author) including threshold
    if coauthor_ids:
        query_mesh = """
            SELECT author_id, coauthor_id, edge_weight
            FROM coauthor_edges
            WHERE author_id = ANY($1::text[]) 
              AND coauthor_id = ANY($1::text[])
              AND author_id < coauthor_id  -- Avoid duplicates (A-B and B-A)
              AND edge_weight >= 5
        """
        mesh_rows = await db.pool.fetch(query_mesh, coauthor_ids)
        
        for r in mesh_rows:
            links.append(NetworkLink(source=r['author_id'], target=r['coauthor_id'], value=r['edge_weight']))
    
    return NetworkGraph(nodes=nodes, links=links)


# Expert Search Response Model
class ExpertSearchResult(BaseModel):
    id: str
    name: str
    dept: Optional[str] = None
    image_url: Optional[str] = None
    similarity: float

@app.get("/search/experts", response_model=List[ExpertSearchResult])
async def search_experts(q: str = Query(..., min_length=2, description="Search query for finding experts"), limit: int = Query(10, ge=1, le=50)):
    """Find experts matching a subject query using semantic search.
    
    Uses vector similarity to find academics whose publication topics
    are semantically related to the search query.
    
    Examples:
    - "machine learning security" → finds experts in adversarial ML, secure AI
    - "renewable energy" → finds experts in solar, wind, sustainability
    - "cancer research" → finds experts in oncology, bioinformatics
    """
    global embedding_model
    
    if embedding_model is None:
        raise HTTPException(
            status_code=503,
            detail="Semantic search is not available. Model not loaded."
        )
    
    # Generate embedding for query
    query_embedding = embedding_model.encode(q, normalize_embeddings=True)
    
    # Convert to pgvector string format
    query_embedding_str = '[' + ','.join(str(x) for x in query_embedding.tolist()) + ']'
    
    # Vector similarity search
    search_query = """
        SELECT 
            ae.author_id,
            a.name as author_name,
            a.dept,
            a.image_url,
            1 - (ae.embedding <=> $1::vector) as similarity
        FROM author_embeddings ae
        JOIN authors a ON ae.author_id = a.id
        WHERE a.is_faculty = TRUE
        ORDER BY ae.embedding <=> $1::vector
        LIMIT $2
    """
    
    rows = await db.pool.fetch(search_query, query_embedding_str, limit)
    
    return [
        ExpertSearchResult(
            id=row['author_id'],
            name=row['author_name'],
            dept=row['dept'],
            image_url=row['image_url'],
            similarity=float(row['similarity'])
        )
        for row in rows
    ]


# ═══════════════════════════════════════════════════════════════
#  UNIFIED SEARCH (v2) — Intent-aware Person + Topic search
# ═══════════════════════════════════════════════════════════════

from search_models import SearchRequest, SearchResponse
from intent import detect_intent
from person_search import person_search as do_person_search, suggest as do_suggest
from topic_search import topic_search as do_topic_search


@app.post("/search", response_model=SearchResponse)
async def unified_search(req: SearchRequest):
    """Unified search endpoint with intent detection.

    Automatically detects whether the query is looking for a person,
    a research topic, or both, and routes to the appropriate search.
    """
    global embedding_model

    # 1. Detect intent
    intent_result = await detect_intent(req.query, db.pool)
    intent = intent_result.intent

    person_results = []
    topic_results = []

    # 2. Route based on intent
    dept_filter = req.filters.get("department") if req.filters else None

    if intent in ("PERSON", "MIXED"):
        person_results = await do_person_search(
            req.query, db.pool,
            limit=req.limit if intent == "PERSON" else min(req.limit, 3),
            department=dept_filter,
        )

    if intent in ("TOPIC", "MIXED"):
        if embedding_model is None:
            raise HTTPException(503, "Semantic search model not loaded")
        topic_results = await do_topic_search(
            req.query, db.pool, embedding_model,
            limit=req.limit,
            department=dept_filter,
        )

    # 3. Build response
    debug_info = None
    if req.debug:
        debug_info = {
            "intent_confidence_person": intent_result.confidence_person,
            "intent_confidence_topic": intent_result.confidence_topic,
            "best_name_match": intent_result.best_name_match,
            "best_name_similarity": intent_result.best_name_similarity,
        }

    return SearchResponse(
        intent=intent,
        person_results=person_results,
        topic_results=topic_results,
        debug=debug_info,
    )


@app.get("/search/suggest")
async def search_suggest(q: str = Query(..., min_length=1)):
    """Autocomplete: top faculty name suggestions for typeahead."""
    return await do_suggest(q, db.pool, limit=5)

