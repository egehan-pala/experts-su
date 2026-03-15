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
    cited_by_count: Optional[int] = 0
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
    query = "SELECT id, name, dept, orcid, image_url, email, phone, areas_of_interest, cited_by_count FROM authors WHERE id ILIKE $1"
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
    
    # Use local cited_by_count from DB
    cited_by_count = row.get('cited_by_count') or 0

    return Author(
        id=row['id'], 
        name=row['name'], 
        dept=row['dept'], 
        orcid=row['orcid'], 
        image_url=row['image_url'], 
        email=row['email'], 
        phone=row['phone'], 
        areas_of_interest=row['areas_of_interest'], 
        pub_count=row.get('total_publications', 0),
        cited_by_count=cited_by_count,
        top_publication=top_pub
    )

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

@app.get("/authors/{author_id}/top-publication-by-year", response_model=Optional[Publication])
async def get_top_publication_by_year(author_id: str, year: int):
    """Get the most cited publication for an author in a specific year."""
    query = """
        SELECT p.id, p.title, p.year, p.citations, p.venue, p.pdf_url, p.publication_date
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id ILIKE $1 AND p.year = $2
        ORDER BY p.citations DESC NULLS LAST
        LIMIT 1
    """
    row = await db.pool.fetchrow(query, author_id, year)
    if not row:
        return None
    return Publication(
        id=row['id'], 
        title=row['title'], 
        year=row['year'], 
        citations=row['citations'], 
        venue=row['venue'],
        pdf_url=row['pdf_url'],
        publication_date=row['publication_date']
    )

@app.get("/authors/{author_id}/recent-publications", response_model=List[Publication])
async def get_recent_publications(author_id: str):
    """Get publications from the last week for an author."""
    # Since we store publication_date as TEXT (YYYY-MM-DD), we use string comparison
    # or cast to date if Postgres supports it nicely.
    query = """
        SELECT p.id, p.title, p.year, p.citations, p.venue, p.pdf_url, p.publication_date
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE (ap.author_id = $1 OR ap.author_id ILIKE '%' || $1)
          AND p.publication_date IS NOT NULL
        ORDER BY p.publication_date DESC
        LIMIT 15
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
async def get_authors(
    page: int = Query(1, ge=1), 
    limit: int = Query(12, ge=1, le=100),
    dept: Optional[str] = Query(None)
):
    """Get all authors with pagination, optionally filtered by department."""
    offset = (page - 1) * limit
    
    # 1. Base WHERE clause
    where_clause = "WHERE a.is_faculty = TRUE"
    params = []
    
    if dept:
        where_clause += " AND a.dept = $1"
        params.append(dept)
    
    # 2. Get total count
    count_query = f"""
        SELECT COUNT(*)
        FROM (
            SELECT a.id
            FROM authors a
            JOIN author_metrics_yearly amy ON a.id = amy.author_id
            {where_clause}
            GROUP BY a.id
            HAVING SUM(amy.pub_count) > 0
        ) as sub
    """
    total_count = await db.pool.fetchval(count_query, *params)
    
    # 3. Get paginated data
    param_idx = len(params) + 1
    query = f"""
        SELECT a.id, a.name, a.dept, a.orcid, a.image_url, a.email, a.phone, COALESCE(SUM(amy.pub_count), 0) as total_pubs
        FROM authors a
        LEFT JOIN author_metrics_yearly amy ON a.id = amy.author_id
        {where_clause}
        GROUP BY a.id, a.name, a.dept, a.orcid, a.image_url, a.email, a.phone
        HAVING COALESCE(SUM(amy.pub_count), 0) > 0
        ORDER BY 
            total_pubs DESC NULLS LAST,
            (a.image_url IS NOT NULL) DESC,
            a.name ASC
        LIMIT ${param_idx} OFFSET ${param_idx + 1}
    """
    
    final_params = params + [limit, offset]
    rows = await db.pool.fetch(query, *final_params)
    
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
            "total_pages": (total_count + limit - 1) // limit if total_count else 0
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

class FingerprintConcept(BaseModel):
    name: str
    weight: float

class FingerprintField(BaseModel):
    field: str
    concepts: List[FingerprintConcept]

class CountryStat(BaseModel):
    code: str
    count: int
    names: List[str] = []

class GeoCitationResponse(BaseModel):
    total_count: int
    countries: List[CountryStat]

class CoAuthorStat(BaseModel):
    name: str
    count: int

class ConceptDetail(BaseModel):
    concept: str
    countries: List[CountryStat]
    co_authors: List[CoAuthorStat]
    top_paper: Optional[Publication]

# Visualization Endpoints

@app.get("/authors/{author_id}/metrics", response_model=List[YearlyMetric])
async def get_author_metrics(
    author_id: str, 
    realtime: bool = Query(False),
    since: Optional[str] = Query(None)
):
    """Get yearly publication and citation counts for an author using the pre-aggregated metrics table."""
    import datetime
    
    # Query aggregated metrics directly
    query = """
        SELECT year, pub_count, citations_year as citations
        FROM author_metrics_yearly
        WHERE author_id = $1 OR author_id ILIKE '%' || $1
        ORDER BY year ASC
    """
    rows = await db.pool.fetch(query, author_id)
    
    if not rows:
        return []

    # Map results
    metrics = [
        YearlyMetric(
            year=r['year'],
            pub_count=r['pub_count'],
            citations=r['citations']
        )
        for r in rows
    ]

    # Handle since filter if provided
    if since and since.isdigit():
        since_val = int(since)
        metrics = [m for m in metrics if m.year >= since_val]

    return metrics

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
    return []


@app.get("/authors/{author_id}/fingerprint", response_model=List[FingerprintField])
async def get_author_fingerprint(author_id: str):
    """Get summarized research concepts for an author grouped by field."""
    import json
    from collections import defaultdict

    # 1. Fetch all publications for this author with topics_json
    query = """
        SELECT p.topics_json
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE (ap.author_id = $1 OR ap.author_id ILIKE '%' || $1)
          AND p.topics_json IS NOT NULL
    """
    rows = await db.pool.fetch(query, author_id)
    
    # 2. Aggregate scores by field and concept
    # Structure: field_name -> concept_name -> cumulative_score
    field_concept_scores = defaultdict(lambda: defaultdict(float))
    
    for row in rows:
        try:
            topics = json.loads(row['topics_json']) if isinstance(row['topics_json'], str) else row['topics_json']
            for t in topics:
                field_name = t.get('field', {}).get('display_name') or "Other"
                concept_name = t.get('display_name')
                score = t.get('score', 0)
                
                if not concept_name:
                    continue
                    
                field_concept_scores[field_name][concept_name] += score
        except (ValueError, TypeError, KeyError):
            continue

    if not field_concept_scores:
        return []

    # 3. Find global max score for normalization (to make weights relative)
    max_concept_score = 0
    for concepts in field_concept_scores.values():
        for score in concepts.values():
            if score > max_concept_score:
                max_concept_score = score
    
    if max_concept_score == 0:
        max_concept_score = 1.0

    # 4. Format response
    result = []
    for field_name, concepts_dict in field_concept_scores.items():
        concept_list = []
        for c_name, c_score in concepts_dict.items():
            # Normalize weight to 0-1 range based on the most dominant concept
            weight = min(1.0, c_score / max_concept_score)
            concept_list.append(FingerprintConcept(name=c_name, weight=round(weight, 3)))
            
        # Sort concepts by weight descending within field
        concept_list.sort(key=lambda x: x.weight, reverse=True)
        
        result.append(FingerprintField(
            field=field_name,
            concepts=concept_list
        ))
        
    # Sort fields by the importance of their top concept
    result.sort(key=lambda x: x.concepts[0].weight if x.concepts else 0, reverse=True)
    
    return result


@app.get("/authors/{author_id}/fingerprint/details", response_model=ConceptDetail)
async def get_concept_details(author_id: str, concept: str = Query(...)):
    """Get detailed stats (countries, co-authors, top paper) for a specific research concept."""
    import json
    from collections import Counter

    # 1. Fetch relevant publications
    query = """
        SELECT p.id, p.title, p.year, p.citations, p.venue, p.pdf_url, p.publication_date, 
               p.topics_json, p.authorships_json
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE (ap.author_id = $1 OR ap.author_id ILIKE '%' || $1)
          AND p.topics_json IS NOT NULL
    """
    rows = await db.pool.fetch(query, author_id)
    
    concept_pubs = []
    for row in rows:
        try:
            topics = json.loads(row['topics_json']) if isinstance(row['topics_json'], str) else row['topics_json']
            if any(t.get('display_name') == concept for t in topics):
                concept_pubs.append(row)
        except (ValueError, TypeError, KeyError):
            continue

    if not concept_pubs:
        raise HTTPException(status_code=404, detail="Concept not found for this author")

    # 2. Find top paper
    top_row = max(concept_pubs, key=lambda x: x['citations'] or 0)
    top_paper = Publication(
        id=top_row['id'],
        title=top_row['title'],
        year=top_row['year'],
        citations=top_row['citations'],
        venue=top_row['venue'],
        pdf_url=top_row['pdf_url'],
        publication_date=top_row['publication_date']
    )

    # 3. Aggregate ONLY from the Top Paper
    country_counts = Counter()
    country_names_map = {} # Map country code -> set of author names from top paper
    co_author_counter = Counter()
    
    def get_auth_name(a):
        return a.get('author', {}).get('display_name') or a.get('raw_author_name') or a.get('raw_name') or a.get('name')
        
    def get_auth_id(a):
        return a.get('author', {}).get('id') or a.get('author_id') or a.get('id') or ''

    # Get authorships specifically from the Top Paper
    try:
        top_authorships = json.loads(top_row['authorships_json']) if isinstance(top_row['authorships_json'], str) else top_row['authorships_json']
        if top_authorships:
            for auth in top_authorships:
                name = get_auth_name(auth)
                alex_id = get_auth_id(auth)
                
                # Check if this authorship belongs to the requested author
                is_target = alex_id and (author_id in author_id) # author_id from arg
                # Note: author_id in author_id is a bug in original code (should be alex_id), fixing below
                is_target = alex_id and (author_id in alex_id)
                
                if not is_target and name:
                    co_author_counter[name] += 1
                
                # Collect countries from THIS AUTHOR in the top paper
                auth_countries = set()
                # 1. Direct countries list
                for c in auth.get('countries', []):
                    if c: auth_countries.add(c)
                # 2. Legacy fallback
                c_code = auth.get('country_code') or auth.get('institution_country_code') or auth.get('institution_country')
                if c_code: auth_countries.add(c_code)
                for inst in auth.get('institutions', []):
                    cc = inst.get('country_code')
                    if cc: auth_countries.add(cc)
                
                # Update global counts for THIS PAPER's countries and map names
                for cc in auth_countries:
                    country_counts[cc] = 1 # Only one paper
                    if not is_target and name:
                        if cc not in country_names_map: country_names_map[cc] = set()
                        country_names_map[cc].add(name)
                        
    except Exception:
        pass

    countries = [
        CountryStat(
            code=k, 
            count=v, 
            names=list(country_names_map.get(k, []))
        ) for k, v in country_counts.items()
    ]
    co_authors = [CoAuthorStat(name=k, count=v) for k, v in co_author_counter.most_common(20)]

    return ConceptDetail(
        concept=concept,
        countries=countries,
        co_authors=co_authors,
        top_paper=top_paper
    )

@app.get("/authors/{author_id}/geo-citations", response_model=GeoCitationResponse)
async def get_author_geo_citations(
    author_id: str, 
    since: Optional[str] = Query(None),
    year: Optional[int] = Query(None)
):
    """Get aggregated geographic locations of works citing this author's research."""
    import httpx
    from collections import Counter
    
    # 1. Fetch ALL publication IDs from OpenAlex (Ensures speed and completeness for global metrics)
    alex_id = author_id if author_id.startswith('A') else f"A{author_id}"
    if not alex_id.startswith('https://openalex.org/'):
        alex_id = f"https://openalex.org/{alex_id}"
        
    works_list = []
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            # per_page=200 is sufficient for current faculty (Onur Varol ~94)
            res = await client.get(f"https://api.openalex.org/works?filter=author.id:{alex_id}&select=id&per_page=200")
            if res.status_code == 200:
                works_list = [w['id'].split('/')[-1] for w in res.json().get('results', [])]
    except Exception as e:
        print(f"Error fetching works from OpenAlex real-time for {author_id}: {e}")
        
    if not works_list:
        # Emergency fallback to local DB if OpenAlex is unreachable
        query_local = """
            SELECT p.id FROM publications p
            JOIN author_publications ap ON p.id = ap.publication_id
            WHERE ap.author_id = $1 OR ap.author_id ILIKE '%' || $1
        """
        rows = await db.pool.fetch(query_local, author_id)
        works_list = [r['id'].split('/')[-1] for r in rows if r['id']]
    
    if not works_list:
        return []
    
    # 2. Query OpenAlex for citations grouped by country
    batch_size = 100
    country_counts = Counter()
    country_names_map = {}
    
    # Get official total citations for the author (lifetime)
    # Only fetch if no filter is applied to save latency
    official_total = 0
    if not since:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                auth_res = await client.get(f"https://api.openalex.org/authors/{alex_id}")
                if auth_res.status_code == 200:
                    official_total = auth_res.json().get('cited_by_count', 0)
        except Exception:
            pass

    async with httpx.AsyncClient(timeout=30.0) as client:
        for i in range(0, len(works_list), batch_size):
            batch = works_list[i:i+batch_size]
            batch_filter = "|".join(batch)
            filter_str = f"referenced_works:{batch_filter}"
            
            if year:
                # Precise year filtering: citations received DURING this specific year
                filter_str += f",publication_year:{year}"
            elif since:
                if (len(since) == 4 or '-' in since):
                    since_date = since if '-' in since else f"{since}-01-01"
                    filter_str += f",from_publication_date:{since_date}"
                
            url = f"https://api.openalex.org/works?filter={filter_str}&group_by=authorships.countries"
            
            try:
                response = await client.get(url)
                if response.status_code == 200:
                    data = response.json()
                    for group in data.get('group_by', []):
                        cc = group['key'].split('/')[-1].upper()
                        count = group['count']
                        display_name = group['key_display_name']
                        
                        country_counts[cc] += count
                        if cc not in country_names_map:
                            country_names_map[cc] = set()
                        if display_name:
                            country_names_map[cc].add(display_name)
                else:
                    print(f"OpenAlex API error (batch {i}): {response.status_code}")
            except Exception as e:
                print(f"Fetch error in geo-citations (batch {i}): {e}")
    
    # Calculate total from distribution if filter is applied OR fetch failed
    if since or official_total == 0:
        official_total = sum(country_counts.values())

    # 3. Format response
    countries = [
        CountryStat(
            code=k, 
            count=v, 
            names=list(country_names_map.get(k, []))
        ) for k, v in country_counts.items()
    ]
    
    countries.sort(key=lambda x: x.count, reverse=True)
    return GeoCitationResponse(total_count=official_total, countries=countries)

@app.get("/authors/{author_id}/geo-collaborations", response_model=List[CountryStat])
async def get_author_geo_collaborations(author_id: str, since: Optional[int] = Query(None)):
    """Get aggregated co-author institution countries for an author."""
    import json
    from collections import Counter

    # 1. Fetch works with authorship data directly from OpenAlex (Fast discovery)
    alex_id = author_id if author_id.startswith('A') else f"A{author_id}"
    if not alex_id.startswith('https://openalex.org/'):
        alex_id = f"https://openalex.org/{alex_id}"
        
    works = []
    import httpx
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            filter_str = f"author.id:{alex_id}"
            if since:
                filter_str += f",from_publication_date:{since}-01-01"
            
            # Use select to minimize data transfer
            url = f"https://api.openalex.org/works?filter={filter_str}&select=authorships&per_page=200"
            res = await client.get(url)
            if res.status_code == 200:
                works = res.json().get('results', [])
    except Exception as e:
        print(f"Error fetching collaborations real-time for {author_id}: {e}")
        
    if not works:
        # Emergency local fallback
        query = """
            SELECT p.authorships_json
            FROM publications p
            JOIN author_publications ap ON p.id = ap.publication_id
            WHERE (ap.author_id = $1 OR ap.author_id ILIKE '%' || $1)
              AND ($2::int IS NULL OR p.year >= $2)
        """
        rows = await db.pool.fetch(query, author_id, since)
        works = [{"authorships": json.loads(r['authorships_json']) if isinstance(r['authorships_json'], str) else r['authorships_json']} for r in rows]

    country_counts = Counter()
    country_names_map = {} # Map country code -> set of country names found
    
    def get_auth_id(a):
        return a.get('author', {}).get('id') or a.get('author_id') or a.get('id') or ''

    for work in works:
        try:
            authorships = work.get('authorships', [])
            if not authorships:
                continue
                
            for auth in authorships:
                alex_id = get_auth_id(auth)
                
                # Exclude the queried author themself
                if alex_id and (author_id in alex_id):
                    continue

                # Robust country check
                found_countries = {} # Map code -> name
                
                # 1. institutions
                for inst in auth.get('institutions', []):
                    cc = inst.get('country_code') or inst.get('country')
                    if cc and isinstance(cc, str) and len(cc) == 2:
                        name = inst.get('display_name') or inst.get('name') or inst.get('country_name') or cc.upper()
                        found_countries[cc.upper()] = name
                
                # 2. countries list (modern OpenAlex)
                for cc in auth.get('countries', []):
                    if cc and isinstance(cc, str) and len(cc) == 2:
                        cc_upper = cc.upper()
                        if cc_upper not in found_countries:
                            found_countries[cc_upper] = cc_upper
                
                # 3. top level fallbacks
                for key in ['country_code', 'institution_country_code', 'institution_country']:
                    cc = auth.get(key)
                    if cc and isinstance(cc, str) and len(cc) == 2:
                        cc_upper = cc.upper()
                        if cc_upper not in found_countries:
                            found_countries[cc_upper] = cc_upper
                
                for cc, cname in found_countries.items():
                    country_counts[cc] += 1
                    if cc not in country_names_map:
                        country_names_map[cc] = set()
                    if cname and cname != cc:
                        country_names_map[cc].add(cname)
                        
        except Exception:
            pass

    countries = [
        CountryStat(
            code=k, 
            count=v, 
            names=list(country_names_map.get(k, []))
        ) for k, v in country_counts.items()
    ]
    
    # Sort by count descending
    countries.sort(key=lambda x: x.count, reverse=True)

    return countries

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
    # Filter by year if provided using strict match
    year_filter = "AND p.year >= $2"
    params = [author_id, year_from]
    if year_to:
        year_filter += " AND p.year <= $3"
        params.append(year_to)

    query = f"""
        SELECT p.id, p.citations, p.authorships_json, p.year
        FROM publications p
        JOIN author_publications ap ON p.id = ap.publication_id
        WHERE ap.author_id = $1 {year_filter}
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
