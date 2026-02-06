"""
Embedding Service for Experts@SU

Generates vector embeddings for author expertise profiles using sentence-transformers.
"""

import asyncio
import logging
from typing import List

import asyncpg
from sentence_transformers import SentenceTransformer

# Model: all-MiniLM-L6-v2 - fast, 384 dimensions
MODEL_NAME = "all-MiniLM-L6-v2"

logger = logging.getLogger(__name__)


def get_db_settings():
    """Load database settings from environment."""
    import os
    from dotenv import load_dotenv
    load_dotenv()
    return {
        "host": os.getenv("DB_HOST", "localhost"),
        "port": int(os.getenv("DB_PORT", "5432")),
        "user": os.getenv("DB_USER", "postgres"),
        "password": os.getenv("DB_PASSWORD", "password"),
        "database": os.getenv("DB_NAME", "experts_su"),
    }


async def generate_author_embeddings() -> None:
    """Generate and store embeddings for all authors based on their topics."""
    settings = get_db_settings()
    
    print("🔢 Loading sentence transformer model...")
    model = SentenceTransformer(MODEL_NAME)
    print(f"   ✅ Model loaded: {MODEL_NAME} ({model.get_sentence_embedding_dimension()} dimensions)")
    
    conn = await asyncpg.connect(**settings)
    
    try:
        print("\n📊 Fetching author expertise profiles...")
        query = """
            SELECT 
                a.id as author_id,
                a.name as author_name,
                STRING_AGG(DISTINCT t.name, ' | ') as topics
            FROM authors a
            LEFT JOIN author_publications ap ON a.id = ap.author_id
            LEFT JOIN publication_topics pt ON ap.publication_id = pt.publication_id
            LEFT JOIN topics t ON pt.topic_id = t.id
            GROUP BY a.id, a.name
            HAVING COUNT(DISTINCT t.id) > 0
            ORDER BY a.name
        """
        rows = await conn.fetch(query)
        print(f"   ✅ Found {len(rows)} authors with topic data")
        
        if not rows:
            print("   ⚠️ No authors with topics found. Run data collection first.")
            return
        
        author_ids: List[str] = []
        expertise_texts: List[str] = []
        
        for row in rows:
            author_ids.append(row['author_id'])
            text = f"{row['author_name']}: {row['topics']}"
            expertise_texts.append(text)
        
        print(f"\n🧠 Generating embeddings for {len(expertise_texts)} authors...")
        embeddings = model.encode(
            expertise_texts,
            show_progress_bar=True,
            batch_size=32,
            normalize_embeddings=True
        )
        print(f"   ✅ Generated {len(embeddings)} embeddings")
        
        print("\n💾 Storing embeddings in database...")
        await conn.execute("TRUNCATE author_embeddings")
        
        insert_query = """
            INSERT INTO author_embeddings (author_id, expertise_text, embedding, updated_at)
            VALUES ($1, $2, $3, NOW())
        """
        
        inserted = 0
        for author_id, text, embedding in zip(author_ids, expertise_texts, embeddings):
            embedding_str = '[' + ','.join(str(x) for x in embedding.tolist()) + ']'
            await conn.execute(insert_query, author_id, text, embedding_str)
            inserted += 1
            
            if inserted % 50 == 0:
                print(f"   Inserted {inserted}/{len(author_ids)} embeddings...")
        
        print(f"   ✅ Stored {inserted} embeddings in author_embeddings table")
        
        count = await conn.fetchval("SELECT COUNT(*) FROM author_embeddings")
        print(f"\n✨ EMBEDDING GENERATION COMPLETE")
        print(f"   Total embeddings in database: {count}")
        
    finally:
        await conn.close()


def main():
    """CLI entry point."""
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "generate":
        asyncio.run(generate_author_embeddings())
    else:
        print("Usage: python -m embedding_service.main generate")


if __name__ == "__main__":
    main()
