import os
import re
import json
import time
import random
from typing import List, Dict, Any
from django.conf import settings
from google import genai
from google.genai import types
from google.genai.errors import APIError

# Initialize Gemini API Client
GEMINI_API_KEY = getattr(settings, "GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY"))
client = genai.Client(api_key=GEMINI_API_KEY)

GEMINI_MODEL = "gemini-3.8-flash"

CLAUSE_RULES = [
    {
        "id": "unlimited_liability",
        "category": "Liability",
        "severity": "high",
        "title": "Uncapped or Missing Liability Ceiling",
        "description": "The contract does not establish a clear monetary aggregate cap or contains clauses waiving liability ceilings.",
        "patterns": [
            r"unlimited\s+liability",
            r"without\s+any\s+limitation\s+of\s+liability",
            r"notwithstanding\s+anything\s+to\s+the\s+contrary.*no\s+cap",
        ],
        "safe_indicator": r"liability\s+shall\s+not\s+exceed|aggregate\s+liability.*capped\s+at"
    },
    {
        "id": "broad_indemnity",
        "category": "Indemnification",
        "severity": "high",
        "title": "Broad Indemnification Exposure",
        "description": "Obligation to indemnify, defend, and hold harmless without explicit carve-outs for gross negligence.",
        "patterns": [
            r"indemnify.*hold\s+harmless",
            r"defend\s+and\s+indemnify",
            r"harmless\s+from\s+any\s+and\s+all\s+claims"
        ],
        "safe_indicator": r"except\s+to\s+the\s+extent\s+arising\s+from.*gross\s+negligence"
    },
    {
        "id": "ip_assignment",
        "category": "Intellectual Property",
        "severity": "medium",
        "title": "Broad IP Assignment",
        "description": "Assignment clause transfers all prior inventions, developments, and works created outside engagement scope.",
        "patterns": [
            r"assigns?\s+all\s+right,\s+title\s+and\s+interest",
            r"work\s+made\s+for\s+hire.*all\s+intellectual\s+property"
        ],
        "safe_indicator": None
    },
    {
        "id": "immediate_termination",
        "category": "Termination",
        "severity": "medium",
        "title": "Unilateral Immediate Termination",
        "description": "Permits termination for convenience without reasonable cure period or advance written notice.",
        "patterns": [
            r"terminate\s+at\s+any\s+time\s+without\s+cause",
            r"terminate\s+immediately\s+upon\s+written\s+notice"
        ],
        "safe_indicator": r"prior\s+written\s+notice\s+of\s+at\s+least\s+\d+\s+days"
    }
]


def _generate_with_retry(prompt: str, max_attempts: int = 3, base_delay: float = 1.0):
    """Calls Gemini with bounded exponential backoff + jitter for transient 503/429 errors."""
    for attempt in range(1, max_attempts + 1):
        try:
            return client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json"
                )
            )
        except APIError as e:
            is_transient = getattr(e, "code", None) in (429, 503) or "503" in str(e) or "UNAVAILABLE" in str(e)
            if not is_transient or attempt == max_attempts:
                raise
            sleep_seconds = base_delay * (2 ** (attempt - 1)) + random.uniform(0, 0.5)
            print(f"[Gemini Retry {attempt}/{max_attempts}] Transient error ({e}); retrying in {sleep_seconds:.2f}s...")
            time.sleep(sleep_seconds)


def generate_ai_remediations(full_text: str, detected_flags: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Uses Gemini to identify verbatim clause boundaries and write balanced redline remediations."""
    if not detected_flags:
        return []

    prompt = f"""
You are an expert contract negotiation attorney.
The following document triggered specific risk flags:
{json.dumps([{ 'id': f['id'], 'category': f['category'], 'snippet': f['snippet'] } for f in detected_flags], indent=2)}

For each flagged risk, review the document text:
1. Locate the exact full clause sentence or paragraph in the text (`original_text`).
2. Draft a market-standard, balanced fallback replacement clause (`proposed_remediation`) that mitigates the risk while remaining commercially acceptable.
3. Provide a concise legal rationale (`explanation`).

Return strictly JSON format matching this schema:
{{
  "clauses": [
    {{
      "id": "<matching rule id>",
      "category": "<Liability | Indemnification | Intellectual Property | Termination>",
      "risk_level": "High" | "Medium" | "Low",
      "original_text": "<verbatim clause excerpt from text>",
      "proposed_remediation": "<revised balanced substitute text>",
      "explanation": "<why this was flagged and what the remediation fixes>"
    }}
  ]
}}

Contract Text:
{full_text[:35000]}
"""

    try:
        response = _generate_with_retry(prompt)
        data = json.loads(response.text)
        return data.get("clauses", [])
    except Exception as e:
        print(f"[Gemini Remediation Error] {e}")
        # Fallback to standard regex snippets if Gemini call encounters an issue
        return [
            {
                "id": f["id"],
                "category": f["category"],
                "risk_level": "High" if f["severity"] == "high" else "Medium",
                "original_text": f["snippet"] or f["title"],
                "proposed_remediation": f["snippet"] or f["title"],
                "explanation": f["description"],
            }
            for f in detected_flags
        ]


def audit_contract_text(full_text: str) -> Dict[str, Any]:
    text_lower = full_text.lower()
    preliminary_flags: List[Dict[str, Any]] = []
    risk_deductions = 0

    for rule in CLAUSE_RULES:
        matched = False
        matched_snippet = None

        for pattern in rule["patterns"]:
            match = re.search(pattern, text_lower, re.IGNORECASE)
            if match:
                matched = True
                start = max(0, match.start() - 60)
                end = min(len(full_text), match.end() + 60)
                matched_snippet = full_text[start:end].strip()
                break

        if matched and rule["safe_indicator"]:
            if re.search(rule["safe_indicator"], text_lower, re.IGNORECASE):
                matched = False

        if matched:
            severity = rule["severity"]
            risk_deductions += 25 if severity == "high" else 15
            preliminary_flags.append({
                "id": rule["id"],
                "category": rule["category"],
                "severity": severity,
                "title": rule["title"],
                "description": rule["description"],
                "snippet": matched_snippet
            })

    has_liability_mention = bool(re.search(r"liability|damages", text_lower))
    if not has_liability_mention and len(full_text.strip()) > 100:
        preliminary_flags.append({
            "id": "missing_limitation_of_liability",
            "category": "Liability",
            "severity": "medium",
            "title": "Missing Limitation of Liability",
            "description": "No liability limitation clause found in the document.",
            "snippet": None
        })
        risk_deductions += 15

    # Enrich detected issues with Gemini-generated redline remediations
    enriched_clauses = generate_ai_remediations(full_text, preliminary_flags)

    compliance_score = max(0, 100 - risk_deductions)
    risk_level = "High" if compliance_score < 60 else "Medium" if compliance_score < 85 else "Low"

    return {
        "compliance_score": compliance_score,
        "risk_level": risk_level,
        "flags_count": len(enriched_clauses),
        "flags": enriched_clauses
    }
