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

   Copy `.env.example` to `.env` and fill in your OpenAlex and database
   credentials. The important variables are:

   - `OPENALEX_ROR_ID`: the ROR identifier for Sabancı University or your target
     institution.
   - `DB_*`: host, port, database name, user and password for your
     Supabase/PostgreSQL instance.
   - `OPENALEX_MAILTO`: optional email for the OpenAlex polite pool.

3. **Apply database migrations**

   ```bash
   make migrate
   ```

4. **Run the ETL pipeline**

   To collect, clean and load data since the default date (configured in
   `SINCE_DEFAULT`):

   ```bash
   make run-full
   ```

   To perform only the collection stage and specify a custom `since` date:

   ```bash
   python -m data_service.cli collect --since 2024-01-01
   ```

## CLI usage

The service is controlled via a Typer CLI. The top‑level commands are:

* `collect`: fetch authors and works from OpenAlex and store them in staging tables.
* `clean`: normalise staged data, deduplicate records and prepare them for loading.
* `load`: upsert normalised records into production tables, compute metrics and
  co‑author networks.
* `full-run`: execute the entire pipeline (collect → clean → load).
* `migrate`: apply SQL migrations to the configured database.

Run `python -m data_service.cli --help` for detailed options.

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

## Troubleshooting & rate limiting

* **429 Too Many Requests**: The OpenAlex API enforces 10 requests per second and
  100k requests per day. Adjust `OPENALEX_RATE_LIMIT_PER_MIN` in your `.env`
  to slow down requests or split large syncs across multiple days.
* **Connection failures**: The HTTP client uses exponential backoff with
  jitter courtesy of `tenacity`. Persistent failures will raise an exception.
* **Long initial syncs**: An institution can have many authors and works.
  Consider backfilling via the OpenAlex snapshot and reserving the API for
  incremental updates.

## License

This project is provided for academic purposes and does not carry a specific
software license. Please adapt and extend it according to your institution's
needs.