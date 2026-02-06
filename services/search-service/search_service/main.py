"""
Search Service for Experts@SU

Provides semantic expert search using pgvector vector similarity.
"""

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
import os
from typing import List, Optional
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Experts@SU Search Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database
DB_DSN = f"postgresql://{os.getenv('DB_USER', 'postgres')}:{os.getenv('DB_PASSWORD', 'password')}@{os.getenv('DB_HOST', 'localhost')}:{os.getenv('DB_PORT', '5432')}/{os.getenv('DB_NAME', 'experts_su')}"

# Embedding model (loaded lazily)
embedding_model = None


class ExpertSearchResult(BaseModel):
    id: str
    name: str
    dept: Optional[str] = None
    image_url: Optional[str] = None
    similarity: float


@app.on_event("startup")
async def startup():
    global embedding_model
    # Load embedding model
    try:
        from sentence_transformers import SentenceTransformer
        embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
        print("✅ Loaded sentence transformer model for semantic search")
    except ImportError:
        print("⚠️ sentence-transformers not installed")
        embedding_model = None


@app.get("/search/experts", response_model=List[ExpertSearchResult])
async def search_experts(
    q: str = Query(..., min_length=2),
    limit: int = Query(10, ge=1, le=50)
):
    """Find experts matching a subject query using semantic search."""
    global embedding_model
    
    if embedding_model is None:
        return []
    
    # Generate query embedding
    query_embedding = embedding_model.encode(q, normalize_embeddings=True)
    query_embedding_str = '[' + ','.join(str(x) for x in query_embedding.tolist()) + ']'
    
    conn = await asyncpg.connect(DB_DSN)
    try:
        search_query = """
            SELECT 
                ae.author_id,
                a.name as author_name,
                a.dept,
                a.image_url,
                1 - (ae.embedding <=> $1::vector) as similarity
            FROM author_embeddings ae
            JOIN authors a ON ae.author_id = a.id
            ORDER BY ae.embedding <=> $1::vector
            LIMIT $2
        """
        
        rows = await conn.fetch(search_query, query_embedding_str, limit)
        
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
    finally:
        await conn.close()


@app.get("/health")
async def health():
    return {"status": "ok", "model_loaded": embedding_model is not None}
