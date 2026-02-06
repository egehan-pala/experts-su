# Embedding Service

Generates vector embeddings for author expertise profiles using sentence-transformers.

## Usage

```bash
# Install dependencies
pip install sentence-transformers asyncpg python-dotenv

# Generate embeddings for all authors
python -m embedding_service.main generate
```

## Model

Uses `all-MiniLM-L6-v2` (384 dimensions) for fast, high-quality embeddings.
