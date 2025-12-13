# Experts@SU data-service

The **Experts@SU data-service** provides a resilient ETL pipeline for the
Experts@SU platform. It ingests scholarly data from the
[OpenAlex API](https://openalex.org), cleans and normalises the records, and
loads them into a **Supabase (PostgreSQL)** backend. The resulting tables
power expert discovery, keyword search, vector ranking and visualisations
such as publications‑per‑year, citation trends and co‑authorship networks.

## Features

* **Asynchronous ingestion** via `httpx` with cursor paging, rate limiting
  and exponential backoff.
* **Data cleaning and deduplication** with deterministic merging rules based
  on ORCID, normalised names and affiliations.
* **Idempotent loading** into production tables with upsert semantics and
  staging areas to detect changes.
* **Per‑author metrics and network analysis** including publications per
  year, citation counts and co‑author edge weights.
* **Typer CLI** for easy orchestration of individual ETL stages or the
  entire pipeline.
* **Dockerised** with a multi‑stage build that runs tests at build time.
* **Makefile** shortcuts for common development tasks.

## Directory layout

```text
services/data-service/
├─ src/data_service/
│  ├─ config.py            # environment and configuration
│  ├─ logging.py           # structured JSON logging
│  ├─ clients/             # API and database clients
│  ├─ etl/                 # collectors, cleaners, loaders, metrics
│  ├─ schemas/             # pydantic models for external and DB records
│  ├─ utils/               # helpers (backoff, hashing, time)
│  └─ cli.py               # Typer entrypoint
│
├─ sql/                    # schema migrations and views
├─ tests/                  # unit tests
├─ requirements.txt        # Python dependency pins
├─ Dockerfile              # multi‑stage container build
├─ Makefile                # helper commands
├─ .env.example            # sample environment configuration
└─ README.md               # this file
```

## Quick start

1. **Install dependencies**

   ```bash
   # From within experts-su/services/data-service
   make setup
   ```

2. **Configure your environment**

   Copy `.env.example` to `.env` and fill in your OpenAlex credentials:

   - `OPENALEX_ROR_ID`: the ROR identifier for Sabancı University or your target
     institution (default: `https://ror.org/049asqa32`)
   - `OPENALEX_MAILTO`: optional email for the OpenAlex polite pool
   - Database credentials are **optional** for testing (see below)

3. **Test the OpenAlex API connection** (no database needed)

   ```bash
   make test-api
   ```

   This fetches 5 sample authors to verify the API works.

4. **Collect author data from OpenAlex**

   Option A: Collect ALL authors (no filters)
   ```bash
   make collect-all
   ```

   Option B: Collect with filters (reduces storage usage)
   ```bash
   make collect-filtered        # Min 50 citations
   make collect-strict          # Min 100 citations + h-index 5
   ```

   Custom filters:
   ```bash
   python3 -m data_service.cli collect-all --min-citations 50 --min-works 10
   ```

   Data is saved to `data_exports/TIMESTAMP/` as JSON files.

5. **When ready: Connect to database and run full pipeline**

   Update `.env` with Supabase credentials, then uncomment database operations in `src/data_service/etl/loaders.py`, then:

   ```bash
   make run-full
   ```

## CLI usage

The service is controlled via a Typer CLI. Available commands:

### Testing & Data Collection (No Database Required)

* `test-api`: Test OpenAlex API without database. Fetches 5 sample authors.
  ```bash
  make test-api
  python3 -m data_service.cli test-api
  ```

* `collect-all`: Fetch ALL authors from OpenAlex. Saves to `data_exports/` as JSON.
  ```bash
  make collect-all
  python3 -m data_service.cli collect-all
  ```

* `collect-all` with filters: Reduce data size by filtering authors.
  ```bash
  # Only researchers with 50+ citations
  python3 -m data_service.cli collect-all --min-citations 50

  # Only researchers with 10+ works and h-index 5+
  python3 -m data_service.cli collect-all --min-works 10 --min-h-index 5

  # Only researchers with ORCID
  python3 -m data_service.cli collect-all --has-orcid

  # Strict: 100+ citations and h-index 5+
  python3 -m data_service.cli collect-all --min-citations 100 --min-h-index 5
  ```

### Full Pipeline (Requires Database)

* `collect`: Fetch authors and works from OpenAlex and store in staging tables.
  ```bash
  python3 -m data_service.cli collect
  python3 -m data_service.cli collect --since 2024-01-01
  ```

* `clean`: Normalise staged data, deduplicate records and prepare for loading.
  ```bash
  python3 -m data_service.cli clean
  ```

* `load`: Load cleaned data (currently saves locally as JSON, skipping Supabase).
  ```bash
  python3 -m data_service.cli load
  ```

* `full-run`: Execute entire pipeline (collect → clean → load).
  ```bash
  make run-full
  python3 -m data_service.cli full-run
  ```

### Database & Maintenance

* `migrate`: Apply SQL migrations to the database.
  ```bash
  make migrate
  ```

* `lint`: Check code style with Ruff and Black.
  ```bash
  make lint
  ```

* `format`: Auto-format code with Black.
  ```bash
  make format
  ```

* `test`: Run unit tests.
  ```bash
  make test
  ```

Run `python3 -m data_service.cli --help` for detailed options.

## ETL workflow

The ETL pipeline follows these phases:

```
    ┌─────────────┐
    │  Collect    │  ← Fetch authors and works using the OpenAlex API
    └─────────────┘
            │
            ▼
    ┌─────────────┐
    │   Clean     │  ← Normalise fields, deduplicate, extract topics
    └─────────────┘
            │
            ▼
    ┌─────────────┐
    │    Load     │  ← Upsert into prod tables, compute metrics & network
    └─────────────┘
```

## Important Notes

### Current Status (Development Mode)

* **Database operations are commented out** to preserve free tier tokens. Data is
  saved locally as JSON files instead.
* **To enable Supabase uploads**: Uncomment the `await db.*` calls in
  `src/data_service/etl/loaders.py` after configuring database credentials.
* **Data exports** are saved to `data_exports/` and are ignored by Git (see `.gitignore`).

### Data Filtering for Storage Efficiency

Use filtering to reduce data size and focus on active researchers:

```bash
# Reduce to ~70% of original size
python3 -m data_service.cli collect-all --min-citations 50

# Reduce to ~30% of original size (strict filter)
python3 -m data_service.cli collect-all --min-citations 100 --min-h-index 5
```

See [FILTER_GUIDE.md](../../FILTER_GUIDE.md) for detailed filtering options.

## Troubleshooting & Rate Limiting

* **429 Too Many Requests**: The OpenAlex API enforces 10 requests per second and
  100k requests per day. Adjust `OPENALEX_RATE_LIMIT_PER_MIN` in your `.env`
  to slow down requests or split large syncs across multiple days.
* **Connection failures**: The HTTP client uses exponential backoff with
  jitter courtesy of `tenacity`. Persistent failures will raise an exception.
* **No data exported**: Verify your `OPENALEX_ROR_ID` is correct and the institution
  has researchers in OpenAlex.
* **Module not found**: Run `make setup` to install the package in editable mode.
* **API parameter errors**: The free OpenAlex API doesn't support `from_updated_date`.
  Use filtering options instead for incremental syncs.

## Architecture Changes

This version of the data-service has been modified for development:

1. **Supabase operations commented out** - Safe to test without database
2. **Local JSON export** - All collected/cleaned data saved to `data_exports/`
3. **Filtering support** - Reduce dataset size with citation/h-index/work count filters
4. **Timestamped exports** - Each run creates a new directory with metadata

To restore full database functionality, update `.env` with valid credentials and
uncomment database calls in `loaders.py`.

## License

This project is provided for academic purposes and does not carry a specific
software license. Please adapt and extend it according to your institution's
needs.