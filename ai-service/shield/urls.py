from django.urls import path
from .views import health_check, scan_text_pii, scan_document_pii

urlpatterns = [
    path('health/', health_check, name='health-check'),
    path('scan-pii/', scan_text_pii, name='scan-pii'),
    path('scan-document/', scan_document_pii, name='scan-document'),
]
