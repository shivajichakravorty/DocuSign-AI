import os
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
import pdfplumber
from rest_framework.views import APIView
from shield.rag import answer_document_query, ingest_document_chunks


from .extractor import extract_pdf_pii, analyzer, anonymizer
from .auditor import audit_contract_text

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

    temp_path = None
    try:
        if uploaded_file:
            temp_path = f"/tmp/{uploaded_file.name}"
            with open(temp_path, "wb+") as destination:
                for chunk in uploaded_file.chunks():
                    destination.write(chunk)
            target_path = temp_path
        elif file_path and os.path.exists(file_path):
            target_path = file_path
        else:
            return Response(
                {"error": "A valid PDF 'file' or existent 'file_path' must be provided."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 1. Spatial PII Extraction
        pages_result = extract_pdf_pii(target_path)
        total_pii = sum(p["entities_count"] for p in pages_result)

        # 2. Extract complete text for clause auditing
        full_text = ""
        with pdfplumber.open(target_path) as pdf:
            for page in pdf.pages:
                page_text = page.extract_text() or ""
                full_text += page_text + "\n"

        # 3. Run Clause Risk Audit
        audit_result = audit_contract_text(full_text)

        return Response({
            "status": "completed",
            "total_entities": total_pii,
            "audit": audit_result,
            "pages": pages_result
        })

    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)


@api_view(['POST'])
def document_chat(request, document_id):
    """
    POST /documents/<document_id>/chat/
    Body: { "query": "What are the payment terms?" }
    """
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
    """
    POST /documents/<document_id>/ingest/
    Body: { "file_path": "/path/to/contract.pdf" }
    """
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

class DocumentChatView(APIView):
    """
    POST /api/documents/<document_id>/chat/
    Body: { "query": "What are the termination terms?" }
    """
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
    """
    POST /api/documents/<document_id>/ingest/
    Body: { "file_path": "/absolute/path/to/contract.pdf" }
    """
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
