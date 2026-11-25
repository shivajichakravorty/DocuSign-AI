import os
import pytest
from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

# Ensure a fallback key is set before Django/shield modules evaluate settings
os.environ.setdefault("GEMINI_API_KEY", "test-dummy-key")


@pytest.fixture(scope="module")
def pii_engines():
    return AnalyzerEngine(), AnonymizerEngine()


def test_presidio_detects_and_anonymizes_pii(pii_engines):
    analyzer, anonymizer = pii_engines
    sample_text = "Contact Jane Doe at jane.doe@example.com for agreement details."

    results = analyzer.analyze(text=sample_text, language="en")
    anonymized = anonymizer.anonymize(text=sample_text, analyzer_results=results)

    detected_types = {r.entity_type for r in results}
    assert "EMAIL_ADDRESS" in detected_types
    assert "PERSON" in detected_types
    assert "jane.doe@example.com" not in anonymized.text
    assert "Jane Doe" not in anonymized.text


def test_clause_auditor_flags_missing_liability_cap():
    from shield.auditor import audit_contract_text

    contract_text = (
        "This Consulting Agreement is entered into between Acme Corp and Client. "
        "The Contractor agrees to deliver software milestones on schedule. "
        "Either party may terminate upon thirty days written notice."
    )

    result = audit_contract_text(contract_text)

    assert 0 <= result["compliance_score"] <= 100
    assert result["compliance_score"] < 100
    assert result["flags_count"] >= 1
    flag_ids = {f["id"] for f in result["flags"]}
    assert "missing_limitation_of_liability" in flag_ids


def test_clause_auditor_handles_empty_input():
    from shield.auditor import audit_contract_text

    result = audit_contract_text("")

    assert result["compliance_score"] == 100
    assert result["flags_count"] == 0
    assert result["flags"] == []
