import os
import json
import redis
import pdfplumber
from django.conf import settings
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from django.http import FileResponse
from .flattener import flatten_and_certify_pdf
import uuid
from .extractor import extract_pdf_pii, analyzer, anonymizer

from shield.rag import answer_document_query, ingest_document_chunks
from .extractor import extract_pdf_pii, analyzer, anonymizer
from .auditor import audit_contract_text

# Redis Client for Pub/Sub progress telemetry
REDIS_HOST = getattr(settings, "REDIS_HOST", "127.0.0.1")
REDIS_PORT = getattr(settings, "REDIS_PORT", 6379)
redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, db=0, decode_responses=True)


def emit_progress(document_id: str, step: str, status_text: str, progress: int, details: dict = None):
    """Publish real-time telemetry if document_id is present."""
    if not document_id:
        return
    payload = {
        "documentId": str(document_id),
        "step": step,
        "status": status_text,
        "progress": progress,
        "details": details or {},
    }
    try:
        redis_client.publish(f"audit-progress:{document_id}", json.dumps(payload))
    except Exception as exc:
        # Prevent telemetry issues from crashing the core audit execution
        print(f"[Telemetry Warning] Could not publish progress to Redis: {exc}")


@api_view(['GET'])
def health_check(request):
    return Response({
        "status": "ok",
        "service": "docushield-django-ai",
        "engine_ready": analyzer is not None
    })


@api_view(['POST'])
def scan_text_pii(request):
    text = request.data.get("text", "")
    if not text:
        return Response({"error": "Field 'text' is required."}, status=status.HTTP_400_BAD_REQUEST)

    results = analyzer.analyze(text=text, language="en")
    anonymized_result = anonymizer.anonymize(text=text, analyzer_results=results)

    entities = [
        {
            "type": r.entity_type,
            "start": r.start,
            "end": r.end,
            "score": round(r.score, 3)
        }
        for r in results
    ]

    return Response({
        "original_text": text,
        "anonymized_text": anonymized_result.text,
        "entities_count": len(entities),
        "entities": entities
    })


@api_view(['POST'])
def scan_document_pii(request):
    uploaded_file = request.FILES.get("file")
    file_path = request.data.get("file_path")
    document_id = request.data.get("document_id")

    temp_path = None
    try:
        emit_progress(document_id, "file_verification", "running", 15)

        if uploaded_file:
            temp_path = f"/tmp/{uploaded_file.name}"
            with open(temp_path, "wb+") as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            target_path = temp_path
        elif file_path and os.path.exists(file_path):
            target_path = file_path
        else:
            emit_progress(document_id, "file_verification", "error", 15, {"error": "Invalid file or path"})
            return Response(
                {"error": "A valid PDF 'file' or existent 'file_path' must be provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        emit_progress(document_id, "file_verification", "done", 25)

        # 1. Spatial PII Extraction
        emit_progress(document_id, "pii_masking", "running", 35)
        pages_result = extract_pdf_pii(target_path)
        total_pii = sum(p.get("entities_count", 0) for p in pages_result)
        emit_progress(document_id, "pii_masking", "done", 55, {"total_pii": total_pii})

        # 2. Extract complete text for clause auditing
        emit_progress(document_id, "text_extraction", "running", 65)
        full_text = ""
        with pdfplumber.open(target_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                full_text += page_text + "\n"
        emit_progress(document_id, "text_extraction", "done", 75)

        # 3. Run Clause Risk Audit (Gemini)
        emit_progress(document_id, "clause_risk_analysis", "running", 80)
        audit_result = audit_contract_text(full_text)
        emit_progress(document_id, "clause_risk_analysis", "done", 95, {
            "risk_level": audit_result.get("risk_level", "Unknown"),
            "compliance_score": audit_result.get("compliance_score", 0)
        })

        emit_progress(document_id, "completed", "done", 100)

        return Response({
            "status": "completed",
            "total_entities": total_pii,
            "audit": audit_result,
            "pages": pages_result
        })

    except Exception as e:
        emit_progress(document_id, "error", "error", 100, {"error": str(e)})
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


@api_view(['POST'])
def document_chat(request, document_id):
    query = request.data.get("query")
    if not query or not query.strip():
        return Response(
            {"error": "Query string is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        result = answer_document_query(str(document_id), query.strip())
        return Response(result, status=status.HTTP_200_OK)
    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
def document_ingest(request, document_id):
    file_path = request.data.get("file_path")
    if not file_path:
        return Response(
            {"error": "file_path is required."},
            status=status.HTTP_400_BAD_REQUEST
        )

    try:
        chunks_count = ingest_document_chunks(str(document_id), file_path)
        return Response(
            {"message": "Ingestion successful", "chunks_stored": chunks_count},
            status=status.HTTP_200_OK
        )
    except Exception as e:
        return Response(
            {"error": str(e)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def flatten_document_view(request):
    """
    Accepts multipart 'file' plus JSON strings for 'redactions', 'tabs', and 'certificate_data'.
    Returns the hardened, flattened PDF binary with SHA-256 headers.
    """
    uploaded_file = request.FILES.get("file")
    if not uploaded_file:
        return Response({"error": "PDF 'file' is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        redactions = json.loads(request.data.get("redactions", "[]"))
        tabs = json.loads(request.data.get("tabs", "[]"))
        cert_raw = request.data.get("certificate_data")
        certificate_data = json.loads(cert_raw) if cert_raw else None
    except json.JSONDecodeError:
        return Response({"error": "Invalid JSON metadata payload."}, status=status.HTTP_400_BAD_REQUEST)

    job_id = str(uuid.uuid4())
    in_path = f"/tmp/{job_id}_in.pdf"
    out_path = f"/tmp/{job_id}_out.pdf"

    try:
        with open(in_path, "wb+") as dest:
            for chunk in uploaded_file.chunks():
                dest.write(chunk)

        hashes = flatten_and_certify_pdf(
            input_path=in_path,
            output_path=out_path,
            redactions=redactions,
            tabs=tabs,
            certificate_data=certificate_data,
        )

        # Read output into memory so temp files can be cleaned up safely
        with open(out_path, "rb") as f:
            pdf_bytes = f.read()

        from django.http import HttpResponse
        response = HttpResponse(pdf_bytes, content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="shielded_{uploaded_file.name}"'
        response["X-Original-SHA256"] = hashes["original_sha256"]
        response["X-Final-SHA256"] = hashes["final_sha256"]
        return response

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    finally:
        for p in (in_path, out_path):
            if os.path.exists(p):
                os.remove(p)

@api_view(['POST'])
def document_ingest(request, document_id):
    """
    Accepts either an uploaded multipart 'file' or a local 'file_path',
    sanitizes PII into surrogate tokens, embeds chunks locally via FastEmbed,
    and stores vectors + surrogate lookup map in PostgreSQL.
    """
    uploaded_file = request.FILES.get("file")
    file_path = request.data.get("file_path")
    temp_path = None

    try:
        if uploaded_file:
            temp_path = f"/tmp/{uuid.uuid4()}_{uploaded_file.name}"
            with open(temp_path, "wb+") as dest:
                for chunk in uploaded_file.chunks():
                    dest.write(chunk)
            target_path = temp_path
        elif file_path and os.path.exists(file_path):
            target_path = file_path
        else:
            return Response(
                {"error": "A valid PDF 'file' or existent 'file_path' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        total_chunks = ingest_document_chunks(document_id, target_path)
        return Response(
            {
                "status": "indexed",
                "document_id": document_id,
                "chunks_indexed": total_chunks,
            },
            status=status.HTTP_200_OK,
        )
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@api_view(['POST'])
def document_chat(request, document_id):
    """
    Accepts { "question": "..." } (or { "query": "..." }), runs privacy-preserving
    hybrid RAG over sanitized chunks, and returns the re-hydrated answer + citations.
    """
    question = (request.data.get("question") or request.data.get("query") or "").strip()
    if not question:
        return Response({"error": "Field 'question' is required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        result = answer_document_query(document_id, question)
        return Response(result, status=status.HTTP_200_OK)
    except ValueError as ve:
        return Response({"error": str(ve)}, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class DocumentChatView(APIView):
    def post(self, request, document_id):
        query = request.data.get("query")
        if not query or not query.strip():
            return Response(
                {"error": "Query string is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            result = answer_document_query(str(document_id), query.strip())
            return Response(result, status=status.HTTP_200_OK)
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )


class DocumentIngestView(APIView):
    def post(self, request, document_id):
        file_path = request.data.get("file_path")
        if not file_path:
            return Response(
                {"error": "file_path is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            chunks_count = ingest_document_chunks(str(document_id), file_path)
            return Response(
                {"message": "Ingestion successful", "chunks_stored": chunks_count},
                status=status.HTTP_200_OK,
            )
        except Exception as e:
            return Response(
                {"error": str(e)},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
