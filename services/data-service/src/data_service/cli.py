"""Command line interface for the Experts@SU data-service.

This module uses Typer to expose user‑friendly commands for running each
stage of the ETL pipeline or the full pipeline. It wires together the
configuration, clients and ETL functions defined in the package.
"""

# from __future__ import annotations

import asyncio
from typing import Optional

import typer

from .config import get_settings, Settings
from .logging import configure_logging
from .clients.openalex import OpenAlexClient
from .clients.supabase import Database
from .etl.collectors import collect as collect_stage
from .etl.cleaners import clean as clean_stage
from .etl.loaders import load as load_stage, save_data_locally


app = typer.Typer(help="Experts@SU ETL data-service")


def _run_async(coro):
    """Utility to run an async coroutine in a new event loop."""
    return asyncio.run(coro)


@app.command(help="Collect authors and works from OpenAlex and store them in staging tables.")
def collect(since: Optional[str] = typer.Option(None, help="ISO date to start incremental sync (YYYY-MM-DD)")) -> None:
    settings = get_settings()
    configure_logging()
    db = Database(settings)
    client = OpenAlexClient(settings)
    async def _cmd() -> None:
        await db.connect()
        await collect_stage(settings, db, client, since=since)
        await client.close()
        await db.close()
    _run_async(_cmd())


@app.command(help="Clean and normalise staged data, deduplicate, compute metrics and networks.")
def clean() -> None:
    settings = get_settings()
    configure_logging()
    db = Database(settings)
    async def _cmd() -> None:
        await db.connect()
        (
            authors,
            publications,
            author_publications,
            topics,
            publication_topics,
            metrics,
            coauthor_edges,
        ) = await clean_stage(db)
        # Save cleaned data locally instead of uploading to Supabase
        await save_data_locally(
            authors,
            publications,
            author_publications,
            topics,
            publication_topics,
            metrics,
            coauthor_edges,
        )
        typer.echo(f"Cleaned and saved {len(authors)} authors, {len(publications)} publications to data_exports/")
        await db.close()
    _run_async(_cmd())


@app.command(help="Load cleaned data (currently saves locally instead of uploading to Supabase).")
def load() -> None:
    settings = get_settings()
    configure_logging()
    db = Database(settings)
    async def _cmd() -> None:
        await db.connect()
        # In this simplified CLI, the clean stage is always run before load to
        # fetch the cleaned objects. A real implementation would persist
        # intermediate results or stream them directly between stages.
        (
            authors,
            publications,
            author_publications,
            topics,
            publication_topics,
            metrics,
            coauthor_edges,
        ) = await clean_stage(db)
        # Load into PostgreSQL
        await load_stage(
            db,
            authors,
            publications,
            author_publications,
            topics,
            publication_topics,
            metrics,
            coauthor_edges,
        )
        typer.echo(f"Data loaded into PostgreSQL database")
        await db.close()
    _run_async(_cmd())


@app.command(help="Run the full ETL pipeline: fetch, clean, filter, and save locally.")
def full_run() -> None:
    """Complete workflow: Fetch → Clean → Filter → Upload to Supabase.
    
    This command runs the entire pipeline using configuration from environment variables
    (specifically SINCE_DEFAULT). It pulls data from OpenAlex, filters it by date,
    cleans/deduplicates it, saves a local backup, and uploads to the production database.
    """
    settings = get_settings()
    configure_logging()
    db = Database(settings)
    client = OpenAlexClient(settings)
    
    async def _cmd() -> None:
        typer.echo("\n" + "="*60)
        typer.echo(f"🚀 FULL RUN STARTING")
        typer.echo("="*60 + "\n")
        
        try:
            await db.connect()
            
            # Step 1: COLLECT (Fetch -> Staging)
            typer.echo("📥 STEP 1: COLLECTING data from OpenAlex (Targeted Mode)...")
            from .etl.collectors import collect_targeted
            await collect_targeted(settings, db, client)
            typer.echo("✅ Collection complete.\n")
            
            # Step 2: CLEAN (Staging -> Production Objects)
            typer.echo("🧹 STEP 2: CLEANING and DEDUPLICATING...")
            (
                authors,
                publications,
                author_publications,
                topics,
                publication_topics,
                metrics,
                coauthor_edges,
            ) = await clean_stage(db)
            typer.echo(f"✅ Cleaning complete. {len(authors)} authors, {len(publications)} publications passed filters.\n")
            
            # Step 3: SAVE LOCAL BACKUP
            typer.echo("💾 STEP 3: SAVING local backup...")
            await save_data_locally(
                authors,
                publications,
                author_publications,
                topics,
                publication_topics,
                metrics,
                coauthor_edges,
            )
            typer.echo("✅ Snapshot saved locally.\n")
            
            # Step 4: LOAD (Production Objects -> Supabase)
            typer.echo("🗄️  STEP 4: UPLOADING to PostgreSQL...")
            await load_stage(
                db,
                authors,
                publications,
                author_publications,
                topics,
                publication_topics,
                metrics,
                coauthor_edges,
            )
            typer.echo("✅ Upload complete!\n")
            
            typer.echo("="*60)
            typer.echo("✨ FULL RUN COMPLETED SUCCESSFULLY")
            typer.echo("="*60 + "\n")
            
        except Exception as e:
            typer.echo(f"\n❌ Error during full run: {str(e)}")
            raise
        
        finally:
            await db.close()
            await client.close()
    
    _run_async(_cmd())


@app.command(help="Test OpenAlex API without database connection. Saves sample data locally.")
def test_api(since: Optional[str] = typer.Option(None, help="ISO date to start (YYYY-MM-DD)")) -> None:
    """Test the OpenAlex API and save sample data locally without needing database.
    
    This is useful for verifying that the API works before connecting to the database.
    """
    settings = get_settings()
    configure_logging()
    client = OpenAlexClient(settings)
    
    async def _cmd() -> None:
        # Determine starting date
        if since is None:
            since_date = settings.since_default
            typer.echo(f"Using default since date: {since_date}")
        else:
            since_date = since
            typer.echo(f"Using provided since date: {since_date}")
        
        typer.echo("\n🔍 Testing OpenAlex API connection...")
        typer.echo(f"📍 Institution ROR ID: {settings.openalex_ror_id}\n")
        
        try:
            # Test collecting a small sample of authors
            typer.echo("📥 Fetching sample authors from OpenAlex...")
            authors_sample = []
            async for author in client.fetch_authors_by_ror(since=since_date):
                authors_sample.append(author)
                if len(authors_sample) >= 5:  # Just get 5 authors for testing
                    break
            
            if authors_sample:
                typer.echo(f"✅ Successfully fetched {len(authors_sample)} sample authors!\n")
                
                # Display sample author info
                for i, author in enumerate(authors_sample, 1):
                    name = author.get("display_name", "Unknown")
                    orcid = author.get("orcid", "No ORCID")
                    typer.echo(f"   {i}. {name} ({orcid})")
                
                # Save sample data
                from pathlib import Path
                import json
                from datetime import datetime
                
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_dir = Path("data_exports_test") / timestamp
                output_dir.mkdir(parents=True, exist_ok=True)
                
                # Save authors
                authors_file = output_dir / "sample_authors.json"
                with open(authors_file, "w") as f:
                    json.dump(authors_sample, f, indent=2)
                
                typer.echo(f"\n💾 Sample data saved to: {authors_file}")
                typer.echo(f"\n✨ API test successful! Your OpenAlex connection works.")
                typer.echo(f"\nTo fetch ALL authors, run: python3 -m data_service.cli collect-all")
            else:
                typer.echo("❌ No authors found. Check your ROR ID or date range.")
        
        except Exception as e:
            typer.echo(f"\n❌ Error testing API: {str(e)}")
            typer.echo("\nCommon issues:")
            typer.echo("  - Check your internet connection")
            typer.echo("  - Verify OPENALEX_ROR_ID is correct")
            typer.echo("  - Check if OpenAlex API is accessible (https://api.openalex.org)")
            raise
        
        finally:
            await client.close()

    asyncio.run(_run())


@app.command(help="Collect authors from OpenAlex with optional filters. Saves to JSON files locally.")
def collect_all(
    since: Optional[str] = typer.Option(None, help="ISO date to start (YYYY-MM-DD)"),
    min_citations: int = typer.Option(0, help="Minimum citation count to include author"),
    min_h_index: int = typer.Option(0, help="Minimum h-index to include author"),
    min_works: int = typer.Option(0, help="Minimum number of works to include author"),
    has_orcid: bool = typer.Option(False, "--has-orcid", help="Only include authors with ORCID"),
) -> None:
    """Fetch authors from the institution and save to JSON without needing database.
    
    Supports filtering to reduce data size and focus on active researchers.
    
    Examples:
        # Get all authors
        python3 -m data_service.cli collect-all
        
        # Only authors with at least 10 citations
        python3 -m data_service.cli collect-all --min-citations 10
        
        # Only active researchers with at least 5 works and 50 citations
        python3 -m data_service.cli collect-all --min-citations 50 --min-works 5
        
        # Only researchers with ORCID
        python3 -m data_service.cli collect-all --has-orcid
    """
    settings = get_settings()
    configure_logging()
    client = OpenAlexClient(settings)
    
    async def _cmd() -> None:
        # Determine starting date
        if since is None:
            since_date = settings.since_default
        else:
            since_date = since
        
        typer.echo("\n🔍 Collecting authors from OpenAlex with filters...")
        typer.echo(f"📍 Institution ROR ID: {settings.openalex_ror_id}\n")
        
        # Display filter settings
        filter_info = []
        if min_citations > 0:
            filter_info.append(f"Citation count ≥ {min_citations}")
        if min_h_index > 0:
            filter_info.append(f"H-index ≥ {min_h_index}")
        if min_works > 0:
            filter_info.append(f"Works count ≥ {min_works}")
        if has_orcid:
            filter_info.append("Must have ORCID")
        
        if filter_info:
            typer.echo("� Active filters:")
            for info in filter_info:
                typer.echo(f"   • {info}")
            typer.echo()
        else:
            typer.echo("⚠️  No filters applied - will collect ALL authors\n")
        
        try:
            # Collect authors with filtering
            typer.echo("📥 Fetching authors from OpenAlex (this may take a few minutes)...\n")
            authors_all = []
            authors_filtered = []
            
            async for author in client.fetch_authors_by_ror(since=since_date):
                authors_all.append(author)
                
                # Apply filters
                summary_stats = author.get("summary_stats", {})
                h_index = summary_stats.get("h_index", 0) or 0
                cited_by_count = author.get("cited_by_count", 0) or 0
                works_count = author.get("works_count", 0) or 0
                has_orcid_val = author.get("orcid") is not None
                
                # Check all filter conditions
                passes_filters = True
                if min_citations > 0 and cited_by_count < min_citations:
                    passes_filters = False
                if min_h_index > 0 and h_index < min_h_index:
                    passes_filters = False
                if min_works > 0 and works_count < min_works:
                    passes_filters = False
                if has_orcid and not has_orcid_val:
                    passes_filters = False
                
                if passes_filters:
                    authors_filtered.append(author)
                
                if len(authors_all) % 10 == 0:
                    typer.echo(f"   ✓ Fetched {len(authors_all)} authors ({len(authors_filtered)} pass filters)...")
            
            if authors_filtered:
                typer.echo(f"\n✅ Collected {len(authors_filtered)} authors (from {len(authors_all)} total) matching filters!\n")
                
                # Save filtered data
                from pathlib import Path
                import json
                from datetime import datetime
                
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                output_dir = Path("data_exports") / timestamp
                output_dir.mkdir(parents=True, exist_ok=True)
                
                # Save authors
                authors_file = output_dir / "authors.json"
                with open(authors_file, "w") as f:
                    json.dump(authors_filtered, f, indent=2)
                
                # Save summary with filter details
                summary = {
                    "timestamp": timestamp,
                    "total_authors_fetched": len(authors_all),
                    "authors_after_filters": len(authors_filtered),
                    "reduction_percent": round((1 - len(authors_filtered) / len(authors_all)) * 100, 1) if authors_all else 0,
                    "filters": {
                        "min_citations": min_citations,
                        "min_h_index": min_h_index,
                        "min_works": min_works,
                        "has_orcid": has_orcid,
                    },
                    "output_file": str(authors_file),
                }
                summary_file = output_dir / "summary.json"
                with open(summary_file, "w") as f:
                    json.dump(summary, f, indent=2)
                
                # Calculate storage savings
                import os
                file_size = os.path.getsize(authors_file) / (1024 * 1024)  # Convert to MB
                
                typer.echo(f"💾 Data saved to: {output_dir}/")
                typer.echo(f"   - {authors_file.name} ({len(authors_filtered)} authors, {file_size:.2f} MB)")
                typer.echo(f"   - {summary_file.name}")
                if len(authors_all) > 0:
                    reduction = (1 - len(authors_filtered) / len(authors_all)) * 100
                    typer.echo(f"\n📊 Storage reduction: {reduction:.1f}% (filtered out {len(authors_all) - len(authors_filtered)} authors)")
                typer.echo(f"\n✨ Collection complete! Ready to integrate with database.")
            elif authors_all:
                typer.echo(f"❌ No authors found matching the filters.")
                typer.echo(f"Total authors in institution: {len(authors_all)}")
                typer.echo(f"\nTry relaxing the filter criteria:")
                typer.echo(f"  - Reduce --min-citations")
                typer.echo(f"  - Reduce --min-h-index")
                typer.echo(f"  - Reduce --min-works")
                typer.echo(f"  - Remove --has-orcid filter")
            else:
                typer.echo("❌ No authors found. Check your ROR ID.")
        
        except Exception as e:
            typer.echo(f"\n❌ Error collecting data: {str(e)}")
            raise
        
        finally:
            await client.close()
    
    _run_async(_cmd())


@app.command(help="Apply SQL migrations to the database.")
def migrate() -> None:
    """Run the migration script. Requires DB connection settings."""
    import subprocess
    configure_logging()
    # Running the migrations via a subprocess ensures environment variables
    # propagate to the Python interpreter executing the script.
    result = subprocess.run(["python3", "sql/migrate.py"], check=False)
    raise SystemExit(result.returncode)


@app.command()
def scrape_images():
    """Scrape faculty images from Sabancı University website."""
    async def _run():
        settings = get_settings()
        db = Database(settings)
        await db.connect()
        try:
            from .etl.scraper import scrape_and_update_images
            await scrape_and_update_images(db)
        finally:
            await db.close()

    asyncio.run(_run())


@app.command(help="Run targeted collection using scraped faculty names.")
def collect_targeted() -> None:
    """Optimize collection by fetching only authors found on the faculty website."""
    from .etl.collectors import collect_targeted as run_targeted
    
    settings = get_settings()
    configure_logging()
    db = Database(settings)
    client = OpenAlexClient(settings)
    
    async def _cmd() -> None:
        try:
            await db.connect()
            await run_targeted(settings, db, client)
        except Exception as e:
            typer.echo(f"Error during targeted collection: {e}")
            raise
        finally:
            await db.close()
            await client.close()
            
    _run_async(_cmd())


@app.command(help="Test: List all author IDs from scraped faculty (no DB required).")
def test_authors(
    output_file: Optional[str] = typer.Option("author_ids.txt", help="File to save author IDs"),
) -> None:
    """Scrape faculty names, find them in OpenAlex, and output author IDs.
    
    This is a lightweight test that doesn't require database connection.
    It shows what authors would be collected and their OpenAlex IDs.
    
    Example:
        python -m data_service.cli test-authors
        python -m data_service.cli test-authors --output-file my_authors.txt
    """
    from .scrapers.faculty import scrape_all_faculty
    
    settings = get_settings()
    configure_logging()
    client = OpenAlexClient(settings)
    
    async def _cmd() -> None:
        print("\n" + "="*60)
        print("🧪 TEST: Collecting Author IDs (No DB Required)")
        print("="*60 + "\n")
        
        # Step 1: Scrape faculty names
        print("📋 Step 1: Scraping faculty names from website...")
        faculty_list = await scrape_all_faculty()
        print(f"   ✅ Found {len(faculty_list)} faculty members\n")
        
        # Step 2: Find authors in OpenAlex
        print("🔍 Step 2: Finding authors in OpenAlex (by name + ROR ID)...\n")
        
        author_data = []  # List of (name, author_id, works_count)
        not_found = []
        
        for faculty in faculty_list:
            name = faculty['name']
            print(f"   Searching: {name}...", end="", flush=True)
            found = False
            
            async for author in client.fetch_authors_by_name(name):
                author_id = author.get("id", "").split("/")[-1]
                display_name = author.get("display_name", name)
                works_count = author.get("works_count", 0)
                h_index = author.get("summary_stats", {}).get("h_index", 0)
                
                author_data.append({
                    "scraped_name": name,
                    "openalex_name": display_name,
                    "author_id": author_id,
                    "works_count": works_count,
                    "h_index": h_index,
                })
                found = True
                print(f" ✓ {author_id} ({works_count} works, h-index: {h_index})")
                break  # Take first match
            
            if not found:
                not_found.append(name)
                print(" ✗ Not found")
        
        # Summary
        print("\n" + "="*60)
        print("📊 SUMMARY")
        print("="*60)
        print(f"   Faculty scraped:    {len(faculty_list)}")
        print(f"   Authors found:      {len(author_data)}")
        print(f"   Not found:          {len(not_found)}")
        
        total_works = sum(a["works_count"] for a in author_data)
        print(f"   Total works to fetch: ~{total_works}")
        print()
        
        # Save author IDs to file
        from pathlib import Path
        import json
        
        # Save simple ID list
        output_path = Path(output_file)
        with open(output_path, "w") as f:
            for author in author_data:
                f.write(f"{author['author_id']}\n")
        print(f"💾 Author IDs saved to: {output_path}")
        
        # Save detailed JSON
        json_path = output_path.with_suffix(".json")
        with open(json_path, "w") as f:
            json.dump({
                "found": author_data,
                "not_found": not_found,
                "total_works_estimate": total_works,
            }, f, indent=2)
        print(f"💾 Detailed data saved to: {json_path}")
        
        # Show not found list
        if not_found:
            print(f"\n⚠️  Not found in OpenAlex ({len(not_found)}):")
            for name in not_found[:10]:
                print(f"   - {name}")
            if len(not_found) > 10:
                print(f"   ... and {len(not_found) - 10} more")
        
        print("\n" + "="*60)
        print("✨ TEST COMPLETE")
        print("="*60 + "\n")
        
        await client.close()
    
    _run_async(_cmd())


def main() -> None:
    """Entry point for ``python -m data_service.cli``."""
    app()


@app.command(help="Run only cleaning and loading stages (skipping collection).")
def clean_and_load() -> None:
    """Run steps 2-4: Clean -> Filter -> Save -> Load.
    Useful for testing with existing data in stg_* tables.
    """
    settings = get_settings()
    configure_logging()
    db = Database(settings)
    
    async def _cmd() -> None:
        try:
            await db.connect()
            
            # Step 2: CLEAN
            typer.echo("🧹 STEP 2: CLEANING and DEDUPLICATING...")
            (
                authors,
                publications,
                author_publications,
                topics,
                publication_topics,
                metrics,
                coauthor_edges,
            ) = await clean_stage(db)
            typer.echo(f"✅ Cleaning complete. {len(authors)} authors, {len(publications)} publications.\n")
            
            # Step 3: SAVE LOCAL BACKUP
            typer.echo("💾 STEP 3: SAVING local backup...")
            await save_data_locally(
                authors,
                publications,
                author_publications,
                topics,
                publication_topics,
                metrics,
                coauthor_edges,
            )
            typer.echo("✅ Snapshot saved locally.\n")
            
            # Step 4: LOAD
            typer.echo("🗄️  STEP 4: UPLOADING to PostgreSQL...")
            await load_stage(
                db,
                authors,
                publications,
                author_publications,
                topics,
                publication_topics,
                metrics,
                coauthor_edges,
            )
            typer.echo("✅ Upload complete (simulated)!\n")
            
        finally:
            await db.close()
    
    _run_async(_cmd())


@app.command(help="Generate vector embeddings for semantic expert search.")
def generate_embeddings() -> None:
    """Generate author expertise embeddings for semantic search.
    
    This creates vector embeddings for each author based on their publication
    topics, enabling semantic search queries like "machine learning security".
    
    Requires: sentence-transformers package (pip install sentence-transformers)
    """
    configure_logging()
    typer.echo("\n" + "="*60)
    typer.echo("🧠 GENERATING AUTHOR EMBEDDINGS FOR SEMANTIC SEARCH")
    typer.echo("="*60 + "\n")
    
    try:
        from .etl.embeddings import generate_author_embeddings
        _run_async(generate_author_embeddings())
        typer.echo("\n" + "="*60)
        typer.echo("✨ EMBEDDING GENERATION COMPLETE")
        typer.echo("="*60 + "\n")
    except ImportError as e:
        typer.echo("❌ Error: Missing dependencies for embedding generation.")
        typer.echo("   Please install: pip install sentence-transformers")
        typer.echo(f"   Details: {e}")
        raise typer.Exit(code=1)


if __name__ == "__main__":
    app()