# Search Service

Semantic expert search using pgvector vector similarity.

## API Endpoints

- `GET /search/experts?q=<query>&limit=10` - Find experts matching query

## Usage

The search functionality is currently integrated into the api-gateway.
This directory contains the standalone search service implementation.

```bash
# Run as FastAPI service
uvicorn search_service.main:app --port 8001 --reload
```
