import asyncio
import asyncpg
import json
import datetime
from collections import defaultdict

async def test_network_logic(author_id, year_from):
    print(f"Testing for {author_id} from {year_from}...")
    
    DSN = "postgresql://postgres:password@localhost:5432/experts_su"
    pool = await asyncpg.create_pool(DSN)
    
    try:
        # 1. Fetch center name
        author_row = await pool.fetchrow("SELECT name FROM authors WHERE id ILIKE $1", author_id)
        center_name = author_row['name'] if author_row else "Unknown Author"
        print(f"Center name: {center_name}")

        # 2. Fetch publications
        year_filter = "AND p.year >= $2"
        # The backend uses f"%{author_id}%"
        params = [f"%{author_id}%", year_from]
        
        query = f"""
            SELECT p.id, p.citations, p.authorships_json, p.year
            FROM publications p
            JOIN author_publications ap ON p.id = ap.publication_id
            WHERE ap.author_id ILIKE $1 {year_filter}
        """
        publication_rows = await pool.fetch(query, *params)
        print(f"Found {len(publication_rows)} publications")
        
        if not publication_rows:
            return

        # 3. Aggregate co-authors
        coauthor_metrics = {}
        papers_data = []

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

        print(f"Aggregated {len(coauthor_metrics)} unique co-authors")
        
        # 4. Rank
        sorted_coauthors = sorted(
            coauthor_metrics.values(),
            key=lambda x: (-x["joint_citations"], -x["joint_papers"], x["name"])
        )
        top_25_list = sorted_coauthors[:25]
        print(f"Top 1 co-author: {top_25_list[0] if top_25_list else 'None'}")
        
    finally:
        await pool.close()

if __name__ == "__main__":
    asyncio.run(test_network_logic('A5073362191', 2016))
