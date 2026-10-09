import re
from typing import List, Dict, Any

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

def audit_contract_text(full_text: str) -> Dict[str, Any]:
    text_lower = full_text.lower()
    flags: List[Dict[str, Any]] = []
    
    # Base score is 100 (clean)
    risk_deductions = 0

    for rule in CLAUSE_RULES:
        matched = False
        matched_snippet = None

        for pattern in rule["patterns"]:
            match = re.search(pattern, text_lower, re.IGNORECASE)
            if match:
                matched = True
                # Extract surrounding context (100 characters before & after)
                start = max(0, match.start() - 60)
                end = min(len(full_text), match.end() + 60)
                matched_snippet = full_text[start:end].strip()
                break

        # Check if a safe indicator mitigates this flag
        if matched and rule["safe_indicator"]:
            if re.search(rule["safe_indicator"], text_lower, re.IGNORECASE):
                # Mitigated
                matched = False

        if matched:
            severity = rule["severity"]
            penalty = 25 if severity == "high" else 15
            risk_deductions += penalty

            flags.append({
                "id": rule["id"],
                "category": rule["category"],
                "severity": severity,
                "title": rule["title"],
                "description": rule["description"],
                "snippet": matched_snippet
            })

    # Liability check: if contract has no liability language at all, add a warning
    has_liability_mention = bool(re.search(r"liability|damages", text_lower))
    if not has_liability_mention and len(full_text.strip()) > 100:
        flags.append({
            "id": "missing_limitation_of_liability",
            "category": "Liability",
            "severity": "medium",
            "title": "Missing Limitation of Liability",
            "description": "No liability limitation clause found in the document.",
            "snippet": None
        })
        risk_deductions += 15

    compliance_score = max(0, 100 - risk_deductions)

    return {
        "compliance_score": compliance_score,
        "risk_level": "High" if compliance_score < 60 else "Medium" if compliance_score < 85 else "Low",
        "flags_count": len(flags),
        "flags": flags
    }
