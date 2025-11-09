"""Time helpers for the data-service.

The ETL pipeline often needs to work with ISO date strings and compute
time windows for incremental syncs. This module centralises such
helpers.
"""

from datetime import datetime, timezone
from typing import Optional


ISO_FORMAT = "%Y-%m-%d"


def parse_iso_date(date_str: str) -> datetime:
    """Parse an ISO date string into a naive datetime object.

    Parameters
    ----------
    date_str: str
        A date in ``YYYY-MM-DD`` format.

    Returns
    -------
    datetime
        A naive datetime representing midnight on the given date.
    """
    return datetime.strptime(date_str, ISO_FORMAT)


def iso_now() -> str:
    """Return the current UTC date as an ISO string (YYYY-MM-DD)."""
    return datetime.now(timezone.utc).date().isoformat()