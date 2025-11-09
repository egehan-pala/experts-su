"""Command line interface for the Experts@SU data-service.

This module uses Typer to expose user‑friendly commands for running each
stage of the ETL pipeline or the full pipeline. It wires together the
configuration, clients and ETL functions defined in the package.
"""

from __future__ import annotations

import asyncio
from typing import Optional

import typer

from .config import get_settings, Settings
from .logging import configure_logging
from .clients.openalex import OpenAlexClient
from .clients.supabase import Database
from .etl.collectors import collect as collect_stage
from .etl.cleaners import clean as clean_stage
from .etl.loaders import load as load_stage


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
        # Store cleaned objects temporarily in memory so they can be passed to load stage later
        # For demonstration, we print counts; in full-run these lists are returned to load
        typer.echo(f"Cleaned {len(authors)} authors, {len(publications)} publications")
        await db.close()
    _run_async(_cmd())


@app.command(help="Load cleaned data into production tables.")
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
        await db.close()
    _run_async(_cmd())


@app.command(help="Run the full ETL pipeline: collect, clean and load.")
def full_run(since: Optional[str] = typer.Option(None, help="ISO date to start incremental sync")) -> None:
    settings = get_settings()
    configure_logging()
    db = Database(settings)
    client = OpenAlexClient(settings)
    async def _cmd() -> None:
        await db.connect()
        await collect_stage(settings, db, client, since=since)
        (
            authors,
            publications,
            author_publications,
            topics,
            publication_topics,
            metrics,
            coauthor_edges,
        ) = await clean_stage(db)
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
        await client.close()
        await db.close()
    _run_async(_cmd())


@app.command(help="Apply SQL migrations to the database.")
def migrate() -> None:
    """Run the migration script. Requires DB connection settings."""
    import subprocess
    configure_logging()
    # Running the migrations via a subprocess ensures environment variables
    # propagate to the Python interpreter executing the script.
    result = subprocess.run(["python", "sql/migrate.py"], check=False)
    raise SystemExit(result.returncode)


def main() -> None:
    """Entry point for ``python -m data_service.cli``."""
    app()


if __name__ == "__main__":
    main()