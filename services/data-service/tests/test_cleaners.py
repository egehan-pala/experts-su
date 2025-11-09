"""Tests for cleaning helpers."""

import os
import sys

# Ensure the src directory is on the Python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from data_service.etl.cleaners import _normalize_name


def test_normalize_name():
    assert _normalize_name("John Doe") == "johndoe"
    assert _normalize_name("Jo-Hn.Doe") == "johndoe"
    assert _normalize_name("Jöhn Døe") == "jöhndøe"  # unicode characters preserved