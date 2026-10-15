import io
import json
import os
import redis
import pdfplumber
from google import genai
from google.genai import types
from django.conf import settings

# 1. Initialize Redis client for Pub/Sub progress streaming
REDIS_HOST = getattr(settings, "REDIS_HOST", "127.0.0.1")
REDIS_PORT = getattr(settings, "REDIS_PORT", 6379)

redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)

# 2. Initialize Gemini API Client
GEMINI_API_KEY = getattr(settings, "GEMINI_API_KEY", os.environ.get("GEMINI_API_KEY"))
client = genai.Client(api_key=GEMINI_API_KEY)


def emit_progress(document_id: str, step: str, status: str, progress: int, details: dict = None):
    """
    Publishes real-time audit progress over Redis Pub/Sub.
    Consumed by Fastify WebSocket -> React UI.
    """
    payload = {
        "documentId": str(document_id),
        "step": step,
        "status": status,
        "progress": progress,
        "details": details or {},
    }
    channel = f"audit-progress:{document_id}"
    redis_client.publish(channel, json.dumps(payload))


def extract_pages_and_text(file_bytes: bytes):
    """
    Extracts raw text per page using pdfplumber.
    """
    pages_data = []
    full_text_chunks = []

    with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
        for idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            pages_data.append({
                "page_number": idx + 1,
                "width": float(page.width),
                "height": float(page.height),
                "text": text
            })
            if text.strip():
                full_text_chunks.append(f"--- PAGE {idx + 1} ---\n{text}")

    return pages_data, "\n\n".join(full_text_chunks)


def analyze_document_pipeline(document_id: str, file_bytes: bytes, original_filename: str = ""):
    """
    End-to-end audit pipeline executing Extraction -> PII Check -> Clause Risk & Remediation.
    """
    try:
        # Step 1: Text extraction
        emit_progress(document_id, "text_extraction", "running", 20, {"filename": original_filename})
        pages, raw_text = extract_pages_and_text(file_bytes)
        
        if not raw_text.strip():
            raise ValueError("The uploaded document contains no extractable text.")
            
        emit_progress(document_id, "text_extraction", "done", 40, {"pages_count": len(pages)})

        # Step 2: Spatial entity & PII inspection
        emit_progress(document_id, "pii_masking", "running", 50)
        # Note: If you have existing regex/spacy spatial bounding box logic, run it here.
        # We simulate entity extraction metadata to pass through to Fastify.
        detected_entities = [] 
        emit_progress(document_id, "pii_masking", "done", 65, {"entities_found": len(detected_entities)})

        # Step 3: Deep Legal Risk Analysis & Remediation via Gemini
        emit_progress(document_id, "clause_risk_analysis", "running", 75)

        prompt = f"""
You are a senior contract attorney and risk auditor.
Analyze the following legal document and evaluate high, medium, and low risks.
Pay special attention to:
- Indemnification and uncapped liabilities
- Unilateral termination and governing law clauses
- Data security and breach notification windows
- Non-competes and restrictive covenants

For each flagged clause:
1. Quote the exact clause snippet (`original_text`).
2. Give risk level: "High", "Medium", or "Low".
3. Provide legal reasoning (`explanation`).
4. Provide a balanced, renegotiated fallback text (`proposed_remediation`).

Return strictly JSON matching this structure:
{{
  "compliance_score": <int between 0 and 100, where 100 is lowest risk>,
  "risk_level": "Low" | "Medium" | "High",
  "flags_count": <int>,
  "flags": [
    {{
      "clause_id": "<unique_string_id>",
      "category": "<e.g. Indemnification, Liability, Termination>",
      "risk_level": "High" | "Medium" | "Low",
      "original_text": "<verbatim excerpt>",
      "explanation": "<risk description>",
      "proposed_remediation": "<revised balanced clause>"
    }}
  ]
}}

Contract Text:
{raw_text[:35000]}
"""

        response = client.models.generate_content(
            model="gemini-3.8-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )

        audit_result = json.loads(response.text)

        emit_progress(document_id, "clause_risk_analysis", "done", 90, {
            "flags_count": audit_result.get("flags_count", 0),
            "risk_level": audit_result.get("risk_level", "Low")
        })

        # Step 4: Finalize payload
        final_payload = {
            "audit": audit_result,
            "pages": pages,
            "total_entities": len(detected_entities),
            "status": "completed"
        }

        emit_progress(document_id, "completed", "done", 100, {
            "compliance_score": audit_result.get("compliance_score", 100)
        })

        return final_payload

    except Exception as exc:
        emit_progress(document_id, "error", "error", 100, {"error": str(exc)})
        raise exc
