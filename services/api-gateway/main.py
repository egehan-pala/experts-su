from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
import os
import datetime
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
class TopPublication(BaseModel):
    title: str
    year: Optional[int]
    citations: Optional[int]
    venue: Optional[str]

class Author(BaseModel):
    id: str
    name: str
    dept: Optional[str] = None
    orcid: Optional[str] = None
    image_url: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    areas_of_interest: Optional[str] = None
    pub_count: Optional[int] = 0
    top_publication: Optional[TopPublication] = None

class Publication(BaseModel):
    id: str
    title: str
    year: Optional[int]
    citations: Optional[int]
    venue: Optional[str]
    pdf_url: Optional[str] = None
    publication_date: Optional[str] = None

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
    query = "SELECT id, name, dept, orcid, image_url, email, phone, areas_of_interest FROM authors WHERE id ILIKE $1"
    row = await db.pool.fetchrow(query, author_id)
    if not row:
        raise HTTPException(status_code=404, detail="Author not found")
        
    pub_query = """
        SELECT p.title, p.year, p.citations, p.venue
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id ILIKE $1
        ORDER BY p.citations DESC NULLS LAST
        LIMIT 1
    """
    pub_row = await db.pool.fetchrow(pub_query, author_id)
    top_pub = TopPublication(**pub_row) if pub_row else None
    
    return Author(id=row['id'], name=row['name'], dept=row['dept'], orcid=row['orcid'], image_url=row['image_url'], email=row['email'], phone=row['phone'], areas_of_interest=row['areas_of_interest'], top_publication=top_pub)

@app.get("/authors/{author_id}/publications", response_model=List[Publication])
async def get_author_publications(author_id: str):
    """Get all publications for an author."""
    query = """
        SELECT p.id, p.title, p.year, p.citations, p.venue, p.pdf_url, p.publication_date
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id ILIKE $1
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
            pdf_url=r['pdf_url'],
            publication_date=r['publication_date']
        )
        for r in rows
    ]

@app.get("/authors/{author_id}/recent-publications", response_model=List[Publication])
async def get_recent_publications(author_id: str):
    """Get publications from the last week for an author."""
    # Since we store publication_date as TEXT (YYYY-MM-DD), we use string comparison
    # or cast to date if Postgres supports it nicely.
    query = """
        SELECT p.id, p.title, p.year, p.citations, p.venue, p.pdf_url, p.publication_date
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id ILIKE $1 
          AND p.publication_date IS NOT NULL
          AND p.publication_date::date >= CURRENT_DATE - INTERVAL '100 days'
        ORDER BY p.publication_date DESC
    """
    try:
        rows = await db.pool.fetch(query, author_id)
    except Exception as e:
        # Fallback if date casting fails for some reason (e.g. invalid date strings)
        print(f"Error in recent-publications query: {e}")
        return []
        
    return [
        Publication(
            id=r['id'], 
            title=r['title'], 
            year=r['year'], 
            citations=r['citations'], 
            venue=r['venue'],
            pdf_url=r['pdf_url'],
            publication_date=r['publication_date']
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
    val: int  # joint_citations_with_center or similar
    image_url: Optional[str] = None
    is_faculty: bool = False
    joint_papers: int = 0
    joint_citations: int = 0
    cluster_id: int = 0

class NetworkLink(BaseModel):
    source: str
    target: str
    value: int # joint_papers
    joint_citations: int = 0

class NetworkGraph(BaseModel):
    center_author_name: str
    nodes: List[NetworkNode]
    links: List[NetworkLink]

# Visualization Endpoints

@app.get("/authors/{author_id}/metrics", response_model=List[YearlyMetric])
async def get_author_metrics(author_id: str):
    """Get yearly publication and citation counts for an author, filled to current year."""
    query = """
        SELECT year, pub_count, citations_year
        FROM author_metrics_yearly
        WHERE author_id = $1
        ORDER BY year ASC
    """
    rows = await db.pool.fetch(query, author_id)
    if not rows:
        return []
        
    start_year = rows[0]['year']
    end_year = datetime.datetime.now().year
    
    # Create a map of existing data
    data_map = {r['year']: r for r in rows}
    
    # Fill missing years
    filled_metrics = []
    for y in range(start_year, end_year + 1):
        if y in data_map:
            r = data_map[y]
            filled_metrics.append(YearlyMetric(year=r['year'], pub_count=r['pub_count'], citations=r['citations_year']))
        else:
            filled_metrics.append(YearlyMetric(year=y, pub_count=0, citations=0))
            
    return filled_metrics

class NestedTopicStat(BaseModel):
    name: str
    count: int

class SubfieldTopics(BaseModel):
    subfield: str
    total_count: int
    topics: List[NestedTopicStat]

@app.get("/authors/{author_id}/topics", response_model=List[SubfieldTopics])
async def get_author_topics(author_id: str):
    """Get aggregated topics grouped by subfield for an author based on their publications."""
    query = """
        SELECT p.topics_json
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id = $1 AND p.topics_json IS NOT NULL
    """
    rows = await db.pool.fetch(query, author_id)
    
    subfield_map = {}
    
    import json
    for row in rows:
        try:
            # topics_json contains a list of topic objects
            topics = json.loads(row['topics_json'])
            for t in topics:
                # OpenAlex format: t["subfield"]["display_name"], t["display_name"]
                subfield_name = t.get('subfield', {}).get('display_name')
                topic_name = t.get('display_name')
                
                if not subfield_name or not topic_name:
                    continue
                    
                if subfield_name not in subfield_map:
                    subfield_map[subfield_name] = {'total': 0, 'topics': {}}
                    
                subfield_map[subfield_name]['total'] += 1
                
                if topic_name not in subfield_map[subfield_name]['topics']:
                    subfield_map[subfield_name]['topics'][topic_name] = 0
                subfield_map[subfield_name]['topics'][topic_name] += 1
                
        except (ValueError, TypeError, KeyError):
            continue
            
    # Format response
    result = []
    for sf, data in subfield_map.items():
        topic_list = [NestedTopicStat(name=t_name, count=t_count) for t_name, t_count in data['topics'].items()]
        # Sort topics inside subfield by count descending
        topic_list.sort(key=lambda x: x.count, reverse=True)
        
        result.append(SubfieldTopics(
            subfield=sf,
            total_count=data['total'],
            topics=topic_list
        ))
        
    # Sort subfields by total count descending
    result.sort(key=lambda x: x.total_count, reverse=True)
    return result

class GalaxyNode(BaseModel):
    name: str
    count: int
    children_available: bool = True

@app.get("/authors/{author_id}/galaxy", response_model=List[GalaxyNode])
async def get_author_galaxy(
    author_id: str,
    category: str = Query(..., regex="^(source|subfield)$"),
    drill: Optional[str] = None,
    drill2: Optional[str] = None,
):
    """Multi-level drill-down data for the Research Galaxy visualization."""
    import json

    # Fetch all publications for this author with relevant JSON fields
    query = """
        SELECT p.id, p.title, p.venue, p.citations, p.topics_json, p.authorships_json
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id = $1
    """
    rows = await db.pool.fetch(query, author_id)

    if category == "source":
        if drill is None:
            # Level 0: Top sources by total citations
            source_map = {}
            for r in rows:
                v = r['venue']
                if not v:
                    continue
                c = r['citations'] or 0
                source_map[v] = source_map.get(v, 0) + c
            items = sorted(source_map.items(), key=lambda x: x[1], reverse=True)[:10]
            return [GalaxyNode(name=n, count=c, children_available=True) for n, c in items]

        elif drill2 is None:
            # Level 1: Subfields within a specific source
            sf_map = {}
            for r in rows:
                if r['venue'] != drill:
                    continue
                if not r['topics_json']:
                    continue
                topics = json.loads(r['topics_json']) if isinstance(r['topics_json'], str) else r['topics_json']
                for t in topics:
                    sf_name = t.get('subfield', {}).get('display_name')
                    if sf_name:
                        sf_map[sf_name] = sf_map.get(sf_name, 0) + 1
            items = sorted(sf_map.items(), key=lambda x: x[1], reverse=True)[:10]
            return [GalaxyNode(name=n, count=c, children_available=True) for n, c in items]

        else:
            # Level 2: Works in that source+subfield -> returns works with children_available for countries
            works = []
            for r in rows:
                if r['venue'] != drill:
                    continue
                if not r['topics_json']:
                    continue
                topics = json.loads(r['topics_json']) if isinstance(r['topics_json'], str) else r['topics_json']
                has_sf = any(t.get('subfield', {}).get('display_name') == drill2 for t in topics)
                if has_sf:
                    works.append(GalaxyNode(
                        name=r['title'] or 'Untitled',
                        count=r['citations'] or 0,
                        children_available=True
                    ))
            works.sort(key=lambda x: x.count, reverse=True)
            return works[:10]

    elif category == "subfield":
        if drill is None:
            # Level 0: Top subfields by pub count
            sf_map = {}
            for r in rows:
                if not r['topics_json']:
                    continue
                topics = json.loads(r['topics_json']) if isinstance(r['topics_json'], str) else r['topics_json']
                for t in topics:
                    sf_name = t.get('subfield', {}).get('display_name')
                    if sf_name:
                        sf_map[sf_name] = sf_map.get(sf_name, 0) + 1
            items = sorted(sf_map.items(), key=lambda x: x[1], reverse=True)[:10]
            return [GalaxyNode(name=n, count=c, children_available=True) for n, c in items]

        elif drill2 is None:
            # Level 1: Works under that subfield
            works = []
            for r in rows:
                if not r['topics_json']:
                    continue
                topics = json.loads(r['topics_json']) if isinstance(r['topics_json'], str) else r['topics_json']
                has_sf = any(t.get('subfield', {}).get('display_name') == drill for t in topics)
                if has_sf:
                    works.append(GalaxyNode(
                        name=r['title'] or 'Untitled',
                        count=r['citations'] or 0,
                        children_available=True
                    ))
            works.sort(key=lambda x: x.count, reverse=True)
            return works[:10]

        else:
            return []



    return []

# Simple in-memory cache for network graphs
_network_cache = {}

@app.get("/authors/{author_id}/network", response_model=NetworkGraph)
async def get_author_network(author_id: str, 
                             year_from: Optional[int] = Query(None), 
                             year_to: Optional[int] = Query(None),
                             limit: int = Query(25, ge=5, le=100)):
    """Get co-authorship network connecting the top collaborators of an author based on joint citations."""
    import json
    import datetime
    from collections import defaultdict

    # Default: last 10 years
    if year_from is None:
        year_from = datetime.datetime.now().year - 10

    # Cache key
    cache_key = f"{author_id}_{year_from}_{year_to}_{limit}"
    if cache_key in _network_cache:
        # Check if cache is fresh (e.g., < 1 hour old - adding simple timestamp would be better but let's keep it simple)
        # For now just return if exists. In a production app, we'd use Redis or a proper TTL cache.
        return _network_cache[cache_key]


    # 1. Fetch center author name
    author_row = await db.pool.fetchrow("SELECT name FROM authors WHERE id ILIKE $1", author_id)
    center_name = author_row['name'] if author_row else "Unknown Author"

    # 2. Fetch all publications for the author including authorships_json
    # Filter by year if provided - use ILIKE with % just in case
    year_filter = "AND p.year >= $2"
    params = [f"%{author_id}%", year_from]
    if year_to:
        year_filter += " AND p.year <= $3"
        params.append(year_to)

    query = f"""
        SELECT p.id, p.citations, p.authorships_json, p.year
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id ILIKE $1 {year_filter}
    """
    publication_rows = await db.pool.fetch(query, *params)
    
        
    if not publication_rows:
        return NetworkGraph(center_author_name=center_name, nodes=[], links=[])

    # 3. Aggregate co-authors from these publications
    coauthor_metrics = {} # author_id -> {metrics}
    papers_data = [] # List of (paper_id, citations, [list_of_coauthor_ids])

    # Helper to normalize IDs
    def clean_id(raw_id):
        if not raw_id: return None
        return raw_id.replace("https://openalex.org/", "").split("/")[-1]

    target_id_clean = clean_id(author_id).lower()

    for row in publication_rows:
        paper_id = row['id']
        citations = row['citations'] or 0
        authorships = row['authorships_json']
        
        if isinstance(authorships, str):
            try: authorships = json.loads(authorships)
            except: continue
        
        if not authorships: continue

        paper_coauthors = []
        for auth in authorships:
            # Format A: Nested 'author' object
            # Format B: Flat 'author_id', 'author_name' keys
            a_info = auth.get('author')
            if a_info:
                raw_aid = a_info.get('id')
                a_name = a_info.get('display_name') or a_info.get('name') or "Unknown"
            else:
                raw_aid = auth.get('author_id')
                a_name = auth.get('author_name') or "Unknown"
            
            if not raw_aid: continue
            
            aid = clean_id(raw_aid)
            
            if aid.lower() == target_id_clean:
                continue
                
            paper_coauthors.append(aid)
            
            if aid not in coauthor_metrics:
                coauthor_metrics[aid] = {
                    "id": aid,
                    "name": a_name,
                    "joint_papers": 0,
                    "joint_citations": 0
                }
            
            coauthor_metrics[aid]["joint_papers"] += 1
            coauthor_metrics[aid]["joint_citations"] += citations
        
        papers_data.append((paper_id, citations, paper_coauthors))


    # 4. Rank and select Top N
    sorted_coauthors = sorted(
        coauthor_metrics.values(),
        key=lambda x: (-x["joint_citations"], -x["joint_papers"], x["name"])
    )
    top_n_list = sorted_coauthors[:limit]
    top_n_ids = {a["id"] for a in top_n_list}

    if not top_n_list:
        return NetworkGraph(center_author_name=center_name, nodes=[], links=[])

    # 5. Build nodes (enrich with DB info if available)
    # Fetch additional info for these authors
    db_authors = await db.pool.fetch(
        "SELECT id, image_url, is_faculty FROM authors WHERE id = ANY($1::text[])",
        list(top_n_ids)
    )
    db_author_info = {r['id']: r for r in db_authors}

    nodes = []
    for a in top_n_list:
        info = db_author_info.get(a["id"], {})
        nodes.append(NetworkNode(
            id=a["id"],
            name=a["name"],
            val=a["joint_citations"],
            image_url=info.get("image_url"),
            is_faculty=info.get("is_faculty", False),
            joint_papers=a["joint_papers"],
            joint_citations=a["joint_citations"]
        ))

    # 6. Build edges between Top N
    edge_metrics = {} # (id1, id2) -> {metrics}
    
    for _, citations, paper_coauthors in papers_data:
        # Filter coauthors to only include those in top N
        filtered = [cid for cid in paper_coauthors if cid in top_n_ids]
        
        # All pairs in the filtered list
        for i in range(len(filtered)):
            for j in range(i + 1, len(filtered)):
                pair = tuple(sorted([filtered[i], filtered[j]]))
                if pair not in edge_metrics:
                    edge_metrics[pair] = {"joint_papers": 0, "joint_citations": 0}
                edge_metrics[pair]["joint_papers"] += 1
                edge_metrics[pair]["joint_citations"] += citations

    links = [
        NetworkLink(source=p[0], target=p[1], value=m["joint_papers"], joint_citations=m["joint_citations"])
        for p, m in edge_metrics.items()
    ]

    # 7. Connected components for cluster_id
    adj = defaultdict(list)
    for l in links:
        adj[l.source].append(l.target)
        adj[l.target].append(l.source)
    
    visited = set()
    cluster_id = 0
    node_clusters = {}
    
    for node in nodes:
        if node.id not in visited:
            cluster_id += 1
            stack = [node.id]
            visited.add(node.id)
            while stack:
                u = stack.pop()
                node_clusters[u] = cluster_id
                for v in adj[u]:
                    if v not in visited:
                        visited.add(v)
                        stack.append(v)
    
    for node in nodes:
        node.cluster_id = node_clusters.get(node.id, 0)

    graph = NetworkGraph(center_author_name=center_name, nodes=nodes, links=links)
    _network_cache[cache_key] = graph
    return graph


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


async def _fallback_topic_search(
    query: str,
    pool: asyncpg.Pool,
    limit: int = 10,
    department: str | None = None,
):
    """SQL-based topic search fallback (no embeddings needed).

    Finds faculty whose publications or topics match the query keywords
    using trigram similarity and ILIKE matching.
    """
    from search_models import TopicResult, MatchSnippet

    dept_filter = ""
    params = [query, f"%{query}%"]
    if department:
        dept_filter = "AND a.dept ILIKE $3"
        params.append(f"%{department}%")

    rows = await pool.fetch(f"""
        WITH matched_pubs AS (
            SELECT DISTINCT ON (a.id, p.id)
                a.id AS faculty_id,
                a.name,
                a.dept,
                a.image_url,
                a.email,
                p.title AS publication_title,
                p.year,
                GREATEST(
                    similarity(COALESCE(t.name, ''), $1),
                    similarity(COALESCE(p.title, ''), $1)
                ) AS sim
            FROM authors a
            JOIN author_publications ap ON a.id = ap.author_id
            JOIN publications p ON ap.publication_id = p.id
            LEFT JOIN publication_topics pt ON p.id = pt.publication_id
            LEFT JOIN topics t ON pt.topic_id = t.id
            WHERE a.is_faculty = TRUE
              AND (
                  t.name ILIKE $2
                  OR p.title ILIKE $2
                  OR p.keywords_json::text ILIKE $2
                  OR p.topics_json::text ILIKE $2
                  OR p.concepts_json::text ILIKE $2
              )
              {dept_filter}
        )
        SELECT
            faculty_id, name, dept, image_url, email,
            publication_title, year, sim,
            COUNT(*) OVER (PARTITION BY faculty_id) AS match_count
        FROM matched_pubs
        ORDER BY match_count DESC, sim DESC
    """, *params)

    # Aggregate rows by faculty
    faculty_map: dict[str, dict] = {}
    for row in rows:
        fid = row["faculty_id"]
        if fid not in faculty_map:
            faculty_map[fid] = {
                "name": row["name"],
                "dept": row["dept"],
                "image_url": row["image_url"],
                "email": row["email"],
                "match_count": row["match_count"],
                "best_sim": row["sim"],
                "snippets": [],
            }
        info = faculty_map[fid]
        if len(info["snippets"]) < 3:
            info["snippets"].append(MatchSnippet(
                publication_title=row["publication_title"],
                snippet=row["publication_title"] or "",
                year=row["year"],
                similarity=round(float(row["sim"]), 4),
            ))

    # Sort faculties by match_count (most matching publications first)
    sorted_faculties = sorted(
        faculty_map.items(),
        key=lambda kv: (kv[1]["match_count"], kv[1]["best_sim"]),
        reverse=True,
    )[:limit]

    results = []
    for fid, info in sorted_faculties:
        # Score: normalize match_count to 0-1 range
        max_matches = sorted_faculties[0][1]["match_count"] if sorted_faculties else 1
        score = min(info["match_count"] / max(max_matches, 1), 1.0)
        results.append(TopicResult(
            id=fid,
            name=info["name"],
            dept=info["dept"],
            image_url=info["image_url"],
            email=info["email"],
            similarity=round(score, 4),
            explanation=info["snippets"],
        ))

    return results


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
        if embedding_model is not None:
            topic_results = await do_topic_search(
                req.query, db.pool, embedding_model,
                limit=req.limit,
                department=dept_filter,
            )
        else:
            # Fallback: SQL-based keyword topic search (no embeddings needed)
            topic_results = await _fallback_topic_search(
                req.query, db.pool,
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
