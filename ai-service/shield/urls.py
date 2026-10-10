from django.urls import path
from .views import document_ingest, health_check, scan_text_pii, scan_document_pii, document_chat

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('scan-pii/', scan_text_pii, name='scan-pii'),
    path('scan-document/', scan_document_pii, name='scan-document'),
    path('documents/<str:document_id>/chat/', document_chat, name='document-chat'),
    path('documents/<str:document_id>/ingest/', document_ingest, name='document-ingest'),
]
