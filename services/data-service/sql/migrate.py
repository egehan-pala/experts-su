"""Simple migration runner for the Experts@SU data-service.

This script connects to the PostgreSQL database specified by the
environment variables and executes the SQL files in the current directory
in lexicographical order. Migrations are idempotent and can be run
multiple times safely.
"""

from __future__ import annotations

import os
import glob
import psycopg2
from dotenv import load_dotenv

load_dotenv(override=True)

import os
import glob
import psycopg2


def run_migrations() -> None:
    # Collect migration files in sorted order
    migration_dir = os.path.dirname(os.path.abspath(__file__))
    files = sorted(
        f for f in glob.glob(os.path.join(migration_dir, "*.sql")) if os.path.isfile(f)
    )
    # Connect to database using environment variables
    print(f"Connecting to DB at {os.environ.get('DB_HOST')}:{os.environ.get('DB_PORT')} as {os.environ.get('DB_USER')}")
    conn = psycopg2.connect(
        host=os.environ.get("DB_HOST"),
        port=os.environ.get("DB_PORT", 5432),
        dbname=os.environ.get("DB_NAME"),
        user=os.environ.get("DB_USER"),
        password=os.environ.get("DB_PASSWORD"),
    )
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            for file in files:
                with open(file, "r", encoding="utf-8") as f:
                    sql = f.read()
                    print(f"Running migration {os.path.basename(file)}")
                    cur.execute(sql)
                    conn.commit()
        print("Migrations completed successfully.")
    except Exception as exc:
        conn.rollback()
        print(f"Error during migrations: {exc}")
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    run_migrations()