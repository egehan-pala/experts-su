"""ORCID public API helper for career-start-year enrichment.

Queries the ORCID public API to retrieve the earliest education or
employment start year for a researcher.  This year is used downstream
by the false-positive filter to reject publications that predate the
researcher's academic career.
"""

from __future__ import annotations

from typing import List, Optional

import httpx

from ..logging import get_logger

logger = get_logger(__name__)

_ORCID_BASE = "https://pub.orcid.org/v3.0"
_HEADERS = {
    "Accept": "application/vnd.orcid+json",
    "User-Agent": "experts-su-etl/1.0 (mailto:experts-su@sabanciuniv.edu)",
}


def _extract_start_years(data: dict, summary_key: str) -> List[int]:
    """Extract all non-null start years from an ORCID affiliation response.

    Parameters
    ----------
    data:
        Parsed JSON body from the educations or employments endpoint.
    summary_key:
        The key inside each summary object, e.g. ``"education-summary"``
        or ``"employment-summary"``.
    """
    years: List[int] = []
    for group in data.get("affiliation-group", []):
        for summary_wrapper in group.get("summaries", []):
            summary = summary_wrapper.get(summary_key, {})
            start_date = summary.get("start-date")
            if not start_date:
                continue
            year_obj = start_date.get("year")
            if year_obj and year_obj.get("value"):
                try:
                    years.append(int(year_obj["value"]))
                except (ValueError, TypeError):
                    continue
    return years


async def fetch_career_start_year(
    orcid: str,
    http_client: httpx.AsyncClient,
) -> Optional[int]:
    """Return the earliest education (or employment) start year for *orcid*.

    The function first tries the ``/educations`` endpoint.  If no
    education start years are found it falls back to ``/employments``.

    Returns ``None`` when no year can be determined or if any error
    occurs (private profile, network timeout, malformed response, etc.).
    The function **never** raises.
    """
    # Normalise: strip to bare ORCID identifier
    bare = orcid.rstrip("/").split("/")[-1]

    # --- Try educations first ---
    try:
        resp = await http_client.get(
            f"{_ORCID_BASE}/{bare}/educations",
            headers=_HEADERS,
            timeout=10.0,
        )
        resp.raise_for_status()
        edu_years = _extract_start_years(resp.json(), "education-summary")
        if edu_years:
            return min(edu_years)
    except Exception as exc:
        logger.warning({
            "message": "ORCID educations request failed",
            "orcid": bare,
            "error": str(exc),
        })
        # Fall through to employments

    # --- Fallback: employments ---
    try:
        resp = await http_client.get(
            f"{_ORCID_BASE}/{bare}/employments",
            headers=_HEADERS,
            timeout=10.0,
        )
        resp.raise_for_status()
        emp_years = _extract_start_years(resp.json(), "employment-summary")
        if emp_years:
            return min(emp_years)
    except Exception as exc:
        logger.warning({
            "message": "ORCID employments request failed",
            "orcid": bare,
            "error": str(exc),
        })

    return None
