
import asyncio
import os
import sys

# Ensure the src directory is on the Python path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), 'src')))

from dotenv import load_dotenv

# Load .env file explicitly
env_path = os.path.join(os.path.dirname(__file__), '.env')
load_dotenv(env_path)

from data_service.config import get_settings
from data_service.clients.supabase import Database
from data_service.cli import full_run

async def reset_db():
    settings = get_settings()
    db = Database(settings)
    
    print("Connecting to database...")
    await db.connect()
    
    print("⚠️  TRUNCATING ALL TABLES...")
    tables = [
        "authors",
        "publications",
        "topics",
        "stg_authors",
        "stg_publications",
        "stg_author_publications",
        "etl_state"
        # Dependent tables (author_publications, coauthor_edges, etc.) will be cascaded
    ]
    
    query = f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE;"
    
    try:
        await db.execute(query)
        print("✅ Database cleaned successfully.")
    except Exception as e:
        print(f"❌ Error cleaning database: {e}")
        raise
    finally:
        await db.close()

if __name__ == "__main__":
    # 1. Reset DB
    asyncio.run(reset_db())
    
    # 2. Run Full ETL via CLI
    # We invoke the Typer command programmatically or via subprocess
    print("\n🚀 Starting Full Run...")
    # It's safer to run via subprocess to ensure clean state
    import subprocess
    subprocess.run([sys.executable, "-m", "data_service.cli", "full-run"], check=True)
