"""Hashing utilities for detecting changes in staged data.

When fetching data from OpenAlex it's important to detect when records
have changed so that we can avoid reprocessing unchanged rows. This
module provides a simple deterministic hash function based on SHA‑256.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict


def compute_hash(obj: Dict[str, Any]) -> str:
    """Compute a stable SHA‑256 hash of a Python dictionary.

    The dictionary is converted to a JSON string with sorted keys to
    guarantee reproducible ordering. The resulting SHA‑256 digest is
    returned in hexadecimal form.

    Parameters
    ----------
    obj: Dict[str, Any]
        The JSON‑serialisable object to hash.

    Returns
    -------
    str
        A 64‑character hexadecimal digest.
    """
    serialized = json.dumps(obj, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(serialized).hexdigest()