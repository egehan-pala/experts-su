"""
Embedding generation for semantic expert search.

Generates vector embeddings for each author based on their publication topics,
then stores them in the author_embeddings table for similarity search.
"""

import asyncio
import logging
from typing import List, Tuple

import asyncpg
from sentence_transformers import SentenceTransformer

from ..config import get_settings

logger = logging.getLogger(__name__)

# Model: all-MiniLM-L6-v2 - fast, 384 dimensions
MODEL_NAME = "all-MiniLM-L6-v2"


async def generate_author_embeddings() -> None:
    """Generate and store embeddings for all authors based on their topics."""
    settings = get_settings()
    
    print("🔢 Loading sentence transformer model...")
    model = SentenceTransformer(MODEL_NAME)
    print(f"   ✅ Model loaded: {MODEL_NAME} ({model.get_sentence_embedding_dimension()} dimensions)")
    
    # Connect to database
    conn = await asyncpg.connect(
        host=settings.db_host,
        port=settings.db_port,
        user=settings.db_user,
        password=settings.db_password,
        database=settings.db_name,
    )
    
    try:
        # Get all authors with their associated topic names
        print("\n📊 Fetching author expertise profiles...")
        query = """
            SELECT 
                a.id as author_id,
                a.name as author_name,
                STRING_AGG(DISTINCT t.name, ' | ') as topics
            FROM authors a
            JOIN author_publications ap ON a.id = ap.author_id
            JOIN publication_topics pt ON ap.publication_id = pt.publication_id
            JOIN topics t ON pt.topic_id = t.id
            WHERE a.is_faculty = TRUE
            GROUP BY a.id, a.name
            HAVING COUNT(DISTINCT t.id) > 0
            ORDER BY a.name
        """
        rows = await conn.fetch(query)
        print(f"   ✅ Found {len(rows)} authors with topic data")
        
        if not rows:
            print("   ⚠️ No authors with topics found. Run data collection first.")
            return
        
        # Prepare data for embedding
        author_ids: List[str] = []
        expertise_texts: List[str] = []
        
        for row in rows:
            author_ids.append(row['author_id'])
            # Combine author name with their topics for context
            text = f"{row['author_name']}: {row['topics']}"
            expertise_texts.append(text)
        
        # Generate embeddings in batches
        print(f"\n🧠 Generating embeddings for {len(expertise_texts)} authors...")
        embeddings = model.encode(
            expertise_texts,
            show_progress_bar=True,
            batch_size=32,
            normalize_embeddings=True  # Normalize for cosine similarity
        )
        print(f"   ✅ Generated {len(embeddings)} embeddings")
        
        # Store embeddings in database
        print("\n💾 Storing embeddings in database...")
        
        # Clear existing embeddings
        await conn.execute("TRUNCATE author_embeddings")
        
        # Insert new embeddings
        insert_query = """
            INSERT INTO author_embeddings (author_id, expertise_text, embedding, updated_at)
            VALUES ($1, $2, $3, NOW())
        """
        
        inserted = 0
        for author_id, text, embedding in zip(author_ids, expertise_texts, embeddings):
            # Convert numpy array to pgvector string format: '[0.1, 0.2, ...]'
            embedding_str = '[' + ','.join(str(x) for x in embedding.tolist()) + ']'
            await conn.execute(insert_query, author_id, text, embedding_str)
            inserted += 1
            
            if inserted % 50 == 0:
                print(f"   Inserted {inserted}/{len(author_ids)} embeddings...")
        
        print(f"   ✅ Stored {inserted} embeddings in author_embeddings table")
        
        # Verify
        count = await conn.fetchval("SELECT COUNT(*) FROM author_embeddings")
        print(f"\n✨ EMBEDDING GENERATION COMPLETE")
        print(f"   Total embeddings in database: {count}")
        
    finally:
        await conn.close()


async def search_experts(query: str, limit: int = 10, db_pool: asyncpg.Pool = None) -> List[Tuple[str, str, float]]:
    """
    Search for experts matching a query using vector similarity.
    
    Returns list of (author_id, author_name, similarity_score) tuples.
    """
    settings = get_settings()
    
    # Load model for query embedding
    model = SentenceTransformer(MODEL_NAME)
    query_embedding = model.encode(query, normalize_embeddings=True)
    
    # Connect if no pool provided
    if db_pool is None:
        conn = await asyncpg.connect(
            host=settings.db_host,
            port=settings.db_port,
            user=settings.db_user,
            password=settings.db_password,
            database=settings.db_name,
        )
        close_conn = True
    else:
        conn = await db_pool.acquire()
        close_conn = False
    
    try:
        # Query for nearest neighbors using cosine similarity
        # pgvector uses <=> for cosine distance (1 - similarity)
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
        
        # Convert query embedding to pgvector string format
        query_embedding_str = '[' + ','.join(str(x) for x in query_embedding.tolist()) + ']'
        rows = await conn.fetch(search_query, query_embedding_str, limit)
        
        results = [
            {
                "id": row['author_id'],
                "name": row['author_name'],
                "dept": row['dept'],
                "image_url": row['image_url'],
                "similarity": float(row['similarity'])
            }
            for row in rows
        ]
        
        return results
        
    finally:
        if close_conn:
            await conn.close()
        else:
            await db_pool.release(conn)


def run_embedding_generation():
    """CLI entry point for embedding generation."""
    asyncio.run(generate_author_embeddings())


if __name__ == "__main__":
    run_embedding_generation()
