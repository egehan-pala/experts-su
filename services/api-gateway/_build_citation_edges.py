import asyncio
import json
import logging
import asyncpg
import os
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
DSN = f"postgresql://{os.getenv('DB_USER','postgres')}:{os.getenv('DB_PASSWORD','password')}@{os.getenv('DB_HOST','localhost')}:{os.getenv('DB_PORT','5432')}/{os.getenv('DB_NAME','experts_su')}"

async def main():
    logger.info("Connecting to database...")
    conn = await asyncpg.connect(DSN)
    
    logger.info("Ensuring citation_edges table exists...")
    await conn.execute("""
        CREATE TABLE IF NOT EXISTS citation_edges (
            citing_author_id TEXT REFERENCES authors(id) ON DELETE CASCADE,
            cited_author_id TEXT REFERENCES authors(id) ON DELETE CASCADE,
            citation_count INT DEFAULT 0,
            PRIMARY KEY (citing_author_id, cited_author_id)
        );
        CREATE INDEX IF NOT EXISTS idx_citation_edges_citing ON citation_edges(citing_author_id);
        CREATE INDEX IF NOT EXISTS idx_citation_edges_cited ON citation_edges(cited_author_id);
    """)
    
    # Map work_id -> list of SU author_ids
    logger.info("Fetching publication-author mappings...")
    rows = await conn.fetch("SELECT id, authorships_json FROM publications")
    work_to_su_authors = {}
    
    # We need a quick way to know which OpenAlex author IDs are SU authors.
    # Our `publications.authorships_json` contains the authors of the paper.
    # What if we just map all SU authors to a set of their `openalex_id`?
    su_authors_rows = await conn.fetch("SELECT id FROM authors")
    su_author_map = {} # openalex URL -> author ID
    for r in su_authors_rows:
        base_id = r['id'].split('/')[-1]
        su_author_map[base_id] = r['id']
        su_author_map[r['id']] = r['id']

    for r in rows:
        work_id = r['id']
        au_json = json.loads(r['authorships_json']) if r['authorships_json'] else []
        su_authors_for_work = []
        for au in au_json:
            au_id = au.get('author', {}).get('id')
            if au_id and au_id in su_author_map:
                su_authors_for_work.append(su_author_map[au_id])
            elif au.get('author_id') in su_author_map:
                su_authors_for_work.append(su_author_map[au.get('author_id')])
        if su_authors_for_work:
            work_to_su_authors[work_id] = list(set(su_authors_for_work))

    logger.info(f"Loaded {len(work_to_su_authors)} valid SU authored works.")

    # Now we iterate through stg_publications to find references
    # citation_edges[citing_author][cited_author] = count
    from collections import defaultdict
    edges = defaultdict(lambda: defaultdict(int))
    
    logger.info("Scanning stg_publications...")
    # stg_publications only has source_id, payload
    stg_rows = await conn.fetch("SELECT source_id, payload FROM stg_publications")
    
    processed = 0
    for r in stg_rows:
        source_id = r['source_id']
        # The citing authors are those SU authors who wrote this publication
        citing_authors = work_to_su_authors.get(source_id)
        if not citing_authors:
            continue
            
        payload = json.loads(r['payload'])
        refs = payload.get('referenced_works', [])
        
        # for each referenced work, did ANY SU author write it?
        for ref in refs:
            # ref is an OpenAlex work ID: "https://openalex.org/W..."
            ref_id = ref.split('/')[-1] if 'openalex.org' in ref else ref
            
            # Since our works table `id` is the OpenAlex work ID
            # Let's check both full URL and base ID
            cited_authors = work_to_su_authors.get(ref) or work_to_su_authors.get(ref_id)
            if cited_authors:
                for citing_author in citing_authors:
                    for ca in cited_authors:
                        if ca != citing_author: # don't count self-citations
                            edges[citing_author][ca] += 1
                        
        processed += 1
        if processed % 1000 == 0:
            logger.info(f"Processed {processed} stg_publications...")
            
    logger.info(f"Found citation edges for {len(edges)} unique citing SU authors.")
    
    # Upsert to DB
    logger.info("Upserting into citation_edges...")
    await conn.execute("TRUNCATE TABLE citation_edges")
    
    insert_query = """
    INSERT INTO citation_edges (citing_author_id, cited_author_id, citation_count)
    VALUES ($1, $2, $3)
    ON CONFLICT (citing_author_id, cited_author_id) DO NOTHING
    """
    
    total_edges = 0
    for c_ing, cited_dict in edges.items():
        for c_ed, count in cited_dict.items():
            if count > 0:
                await conn.execute(insert_query, c_ing, c_ed, count)
                total_edges += 1
                
    logger.info(f"Done. Inserted {total_edges} author-to-author internal citation edges.")
    
    await conn.close()

if __name__ == '__main__':
    asyncio.run(main())
