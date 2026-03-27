"""Tests for the false-positive publication filter in cleaners.py."""

import os
import sys

# Ensure the src directory is on the Python path for imports
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'src')))

from data_service.schemas.openalex import OAWork, OAAuthorship, OAAuthorshipAuthor, OAAffiliation
from data_service.etl.cleaners import _is_false_positive_work


def _make_work(authorships):
    """Helper to build a minimal OAWork with given authorships."""
    return OAWork(
        id="https://openalex.org/W999",
        authorships=authorships,
    )


def _make_authorship(author_id=None, orcid=None, display_name="Some Author",
                     institutions=None, raw_affiliation_strings=None):
    """Helper to build an OAAuthorship record."""
    return OAAuthorship(
        author=OAAuthorshipAuthor(
            id=f"https://openalex.org/{author_id}" if author_id else None,
            orcid=f"https://orcid.org/{orcid}" if orcid else None,
            display_name=display_name,
        ),
        institutions=institutions or [],
        raw_affiliation_strings=raw_affiliation_strings or [],
    )


def _make_institution(name="MIT", ror=None, country_code="US"):
    return OAAffiliation(
        display_name=name,
        ror=ror,
        country_code=country_code,
    )


SABANCI_ROR = "https://ror.org/03ym4e796"


class TestAuthorIDMatch:
    """When the owner's OpenAlex ID appears in the authorship list."""

    def test_id_match_no_orcid_needed(self):
        """Author ID matches and owner has no ORCID → not false positive."""
        work = _make_work([
            _make_authorship(author_id="A123", display_name="John Doe"),
        ])
        assert _is_false_positive_work(work, owner_orcid=None, owner_oa_ids={"A123"}, institution_ror=SABANCI_ROR) is False

    def test_id_match_with_matching_orcid(self):
        """Author ID + ORCID both match → not false positive."""
        work = _make_work([
            _make_authorship(author_id="A123", orcid="0000-0001-2345-6789"),
        ])
        assert _is_false_positive_work(
            work,
            owner_orcid="https://orcid.org/0000-0001-2345-6789",
            owner_oa_ids={"A123"},
            institution_ror=SABANCI_ROR,
        ) is False

    def test_id_match_orcid_mismatch_no_affiliation(self):
        """Author ID matches but ORCID doesn't and no Sabancı affiliation → false positive.
        
        This catches OpenAlex name-collision merges where two different people
        share an OpenAlex ID.
        """
        work = _make_work([
            _make_authorship(
                author_id="A123",
                orcid="0000-9999-9999-9999",
                institutions=[_make_institution("Harvard University")],
            ),
        ])
        assert _is_false_positive_work(
            work,
            owner_orcid="https://orcid.org/0000-0001-2345-6789",
            owner_oa_ids={"A123"},
            institution_ror=SABANCI_ROR,
        ) is True

    def test_id_match_orcid_mismatch_but_sabanci_affiliation(self):
        """Author ID matches, ORCID doesn't, but Sabancı affiliation present → not false positive."""
        work = _make_work([
            _make_authorship(
                author_id="A123",
                orcid="0000-9999-9999-9999",
                institutions=[_make_institution("Sabancı University", ror=SABANCI_ROR, country_code="TR")],
            ),
        ])
        assert _is_false_positive_work(
            work,
            owner_orcid="https://orcid.org/0000-0001-2345-6789",
            owner_oa_ids={"A123"},
            institution_ror=SABANCI_ROR,
        ) is False


class TestORCIDMatch:
    """When the owner's ORCID appears on a co-author (but not ID match)."""

    def test_orcid_match_on_different_author_id(self):
        """ORCID matches even though the OA ID is different → not false positive."""
        work = _make_work([
            _make_authorship(author_id="A999", orcid="0000-0001-2345-6789"),
        ])
        assert _is_false_positive_work(
            work,
            owner_orcid="https://orcid.org/0000-0001-2345-6789",
            owner_oa_ids={"A123"},
            institution_ror=SABANCI_ROR,
        ) is False


class TestAffiliationMatch:
    """When Sabancı affiliation is the only confirming signal."""

    def test_sabanci_ror_match(self):
        """Co-author institution has Sabancı ROR → not false positive."""
        work = _make_work([
            _make_authorship(
                author_id="A999",
                institutions=[_make_institution("Sabancı University", ror=SABANCI_ROR, country_code="TR")],
            ),
        ])
        assert _is_false_positive_work(
            work, owner_orcid=None, owner_oa_ids={"A123"}, institution_ror=SABANCI_ROR,
        ) is False

    def test_sabanci_name_match(self):
        """Co-author institution name contains 'sabanci' → not false positive."""
        work = _make_work([
            _make_authorship(
                author_id="A999",
                institutions=[_make_institution("Sabanci University")],
            ),
        ])
        assert _is_false_positive_work(
            work, owner_orcid=None, owner_oa_ids={"A123"}, institution_ror=SABANCI_ROR,
        ) is False

    def test_sabanci_raw_affiliation_match(self):
        """Raw affiliation string contains 'sabanci' → not false positive."""
        work = _make_work([
            _make_authorship(
                author_id="A999",
                raw_affiliation_strings=["Department of CS, Sabanci University, Istanbul"],
            ),
        ])
        assert _is_false_positive_work(
            work, owner_orcid=None, owner_oa_ids={"A123"}, institution_ror=SABANCI_ROR,
        ) is False


class TestFalsePositive:
    """Cases where the work IS a false positive."""

    def test_no_signals_at_all(self):
        """No ID, ORCID, or affiliation match → false positive."""
        work = _make_work([
            _make_authorship(
                author_id="A999",
                institutions=[_make_institution("Harvard University")],
            ),
        ])
        assert _is_false_positive_work(
            work, owner_orcid=None, owner_oa_ids={"A123"}, institution_ror=SABANCI_ROR,
        ) is True

    def test_owner_has_orcid_but_no_match(self):
        """Owner has ORCID, but no co-author shares it or has Sabancı affiliation."""
        work = _make_work([
            _make_authorship(
                author_id="A999",
                orcid="0000-9999-0000-0000",
                institutions=[_make_institution("Stanford University")],
            ),
        ])
        assert _is_false_positive_work(
            work,
            owner_orcid="https://orcid.org/0000-0001-2345-6789",
            owner_oa_ids={"A123"},
            institution_ror=SABANCI_ROR,
        ) is True

    def test_empty_authorships(self):
        """Work with no authorships → false positive (no confirming signal)."""
        work = _make_work([])
        assert _is_false_positive_work(
            work, owner_orcid=None, owner_oa_ids={"A123"}, institution_ror=SABANCI_ROR,
        ) is True


class TestMergedAuthorIDs:
    """Test with multiple known OpenAlex IDs (merged authors)."""

    def test_secondary_id_match(self):
        """Co-author matches a secondary (merged) OA ID → not false positive."""
        work = _make_work([
            _make_authorship(author_id="A456"),
        ])
        assert _is_false_positive_work(
            work, owner_orcid=None, owner_oa_ids={"A123", "A456"}, institution_ror=SABANCI_ROR,
        ) is False
