"""Tests for cleaning helpers."""

import os
import sys

# Ensure the src directory is on the Python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from data_service.etl.cleaners import _normalize_name, _sanitize_name


def test_normalize_name():
    assert _normalize_name("John Doe") == "johndoe"
    assert _normalize_name("Jo-Hn.Doe") == "johndoe"
    # _normalize_name strips ALL non-[a-z0-9] chars; unicode letters like ö/ø are
    # not in [a-z0-9] so they are removed, but remaining ASCII letters stay.
    # "Jöhn Døe" → strip ö,space,ø → "jhne" ... actually: J(ö→'')hn D(ø→'')e → "jhnde"
    assert _normalize_name("Jöhn Døe") == "jhnde"


def test_sanitize_name_collapses_spaces():
    """Extra whitespace between name parts must be collapsed to a single space."""
    assert _sanitize_name("Meltem  Müftüler Baç") == "Meltem Müftüler Baç"
    assert _sanitize_name("  Onur  Varol  ") == "Onur Varol"
    assert _sanitize_name("Kamer  Kaya") == "Kamer Kaya"
    assert _sanitize_name("Normal Name") == "Normal Name"   # unchanged
    assert _sanitize_name("A   B   C") == "A B C"           # multiple spaces
    assert _sanitize_name("") == ""                          # empty string handled