# 🛡️ DocuShield AI

**DocuShield AI** is a privacy-first digital document signing, legal risk auditing, and zero-leakage contract intelligence platform. It combines a multi-party e-signature workflow with an AI security engine that detects Personally Identifiable Information (PII), flags hidden legal liabilities, enforces legal approval gates, enables PII-masked RAG document Q&A, and seals executed agreements with cryptographic SHA-256 integrity certificates.

---

## ✨ Key Features

### 🔐 Authentication & Multi-Tenant Access
- **Secure Session Lifecycle:** End-to-end user registration, login, and password reset flow powered by `bcryptjs` password hashing, signed JWT tokens, and HTTP-only session cookies.
- **Tenant Isolation:** Protected client routes, custom `useAuth` hooks, and strict per-user document isolation at the API and database layers.
- **Interactive Dashboard:** Real-time document status filtering, instant search, live metrics, and an in-app architecture & workflow documentation guide.

### 📄 Interactive Signing & Envelope Workspace
- **Streaming Document Ingestion:** High-throughput `@fastify/multipart` PDF uploads streamed directly to storage via `pipeline()` with MIME-type and size validation.
- **Multi-Page PDF Canvas:** In-browser PDF rendering (`react-pdf` / `pdfjs-dist`) with zoom controls, page jump citations, and responsive percentage-based `(X, Y)` coordinate overlays.
- **Draggable Field Placement:** Place, reposition, and synchronize `signature`, `initials`, `date`, and custom `text` fields across pages.
- **Tokenized Guest Signing Portal:** Cryptographically secure 32-byte signing tokens (`/sign/:token`) allow external signers to complete fields (with auto-derived initials, date stamps, and text inputs) and execute agreements without creating an account.

### 🛡️ AI Privacy, Risk Auditing & Zero-Leakage RAG (`ai-service`)
- **Spatial PII Detection & Visual Shielding:** Powered by Microsoft Presidio, spaCy NER (`en_core_web_sm`), and `pdfplumber` to detect sensitive entities (SSNs, emails, names, phone numbers, URLs) and map them to normalized page bounding boxes `[x, y, w, h]` with a live **Shield View** toggle.
- **Zero-Leakage Surrogate RAG Chat:** Indexes document pages into `pgvector` using local `FastEmbed` (`BAAI/bge-small-en-v1.5`) embeddings after replacing sensitive PII with reversible `<SURROGATE>` tokens—allowing `gemini-2.5-flash` to answer contract questions with clickable page citations without exposing raw PII to external LLM APIs.
- **Contract Clause Risk Auditing & Redlining:** Automated legal risk inspection flagging missing limitation-of-liability clauses, broad indemnification traps, and one-sided terms—computing a dynamic Compliance Score (`0–100`) and risk tier (`Low`, `Medium`, `High`) alongside interactive clause redlining.
- **Legal Approval Gatekeeper:** Blocks external signing invites on `High` risk or rejected agreements until Legal Counsel approves the redlines.
- **Asynchronous Job Tracking:** Background audit processing via `BullMQ` + `Redis` with real-time progress streaming over WebSockets.

### 🔒 Cryptographic Integrity & Hardened PDF Export
- **SHA-256 Tamper Sealing & Audit Ledger:** Records pre-signing and post-signing SHA-256 document digests alongside an immutable signer telemetry ledger (IP address, user agent, UTC timestamps, and per-tab SHA-256 signature checksums) verifiable inside the **Audit Seal** modal.
- **Binary Stream Redaction & Flattening (`PyMuPDF`):** Scrubs masked PII characters directly from the underlying PDF content stream, permanently burns placed signatures onto pages, and appends a cryptographic **Certificate of Completion** page for both **Redacted PDF** and **Executed PDF** exports.

---

## 🏗️ System Architecture

```text
┌──────────────────────────────────────────────────────────┐
│              React + Vite Frontend (TypeScript)          │
│  • Split-Pane PDF Viewer & Bounding-Box Shield Overlays  │
│  • Draggable Signature Tabs & Guest Signing Portal       │
│  • AI Risk Drawer, Clause Redliner & Zero-Leakage Chat   │
│  • Cryptographic Audit Seal & Tamper Verification Modal  │
└─────────────────────────────┬────────────────────────────┘
                              │ REST / WebSockets
┌─────────────────────────────▼────────────────────────────┐
│             Fastify Edge Gateway (Node.js)               │
│  • JWT Auth, Password Reset & Legal Approval Gate        │
│  • Streaming Multipart Uploads & Hardened PDF Exports    │
│  • Cryptographic Signing Ledger & SHA-256 Verification   │
│  • BullMQ + Redis Async Job Dispatcher & WS Pub/Sub      │
└──────────────┬────────────────────────────┬──────────────┘
               │                            │ HTTP / Multipart
┌──────────────▼──────────────┐  ┌──────────▼──────────────┐
│   PostgreSQL + pgvector     │  │   Django AI Service     │
│  • Users, Docs & Signers    │  │  • Presidio + spaCy NER │
│  • Signature Tabs & Clauses │  │  • FastEmbed + Hybrid   │
│  • Vector Chunks (384-dim)  │  │    pgvector RAG Search  │
│  • Redactions & Audit Logs  │  │  • Gemini 2.5 Flash QA  │
│  • SHA-256 Seals & Certs    │  │  • PyMuPDF Flattener    │
└─────────────────────────────┘  └─────────────────────────┘

🛠️ Tech Stack
Frontend: React 19, TypeScript, Vite, Tailwind CSS, react-pdf, Lucide Icons, Axios
API Gateway: Node.js, Fastify, @fastify/jwt, @fastify/cookie, @fastify/multipart, @fastify/websocket, BullMQ, Redis
AI & PDF Microservice: Python 3.11+, Django, Django REST Framework, Microsoft Presidio, spaCy, FastEmbed (BAAI/bge-small-en-v1.5), Google Gemini (gemini-2.5-flash), pdfplumber, PyMuPDF (fitz)
Database: PostgreSQL (pgvector, uuid-ossp, pgcrypto, relational schemas & JSONB audit trails)

docushield-ai/
├── frontend/                   # React + Vite + TypeScript Client
│   └── src/
│       ├── api/                # Axios client with auth interceptors
│       ├── components/         # Layout, Dashboard, ClauseRedlineManager, AuditCertificateModal, DocumentationModal
│       ├── context/            # AuthContext session state
│       ├── pages/              # Login, Register, ForgotPassword, ResetPassword, Dashboard, DocumentWorkspace, PublicSigningPortal
│       └── types/              # Strict TypeScript interfaces
│
├── backend/                    # Fastify + TypeScript Edge Gateway
│   ├── uploads/                # Local PDF storage
│   └── src/
│       ├── plugins/            # JWT & cookie auth decorators
│       ├── queues/             # BullMQ audit queue & worker
│       ├── routes/             # auth, document, approval, signing, and RAG proxy routes
│       ├── services/           # SHA-256 file hashing & signature checksum utilities
│       ├── db.ts               # PostgreSQL connection pool
│       └── server.ts           # Fastify server entrypoint
│
└── ai-service/                 # Python + Django AI & Security Microservice
    ├── config/                 # Django settings & URL routing
    └── shield/
        ├── extractor.py        # pdfplumber + Presidio spatial PII bounding-box extractor
        ├── auditor.py          # Contract clause risk evaluator & compliance scoring
        ├── rag.py              # Zero-Leakage Surrogate PII sanitizer, FastEmbed indexer & Gemini 2.5 RAG
        ├── flattener.py        # PyMuPDF binary redaction, signature burning & certificate builder
        └── views.py            # DRF API endpoints (/scan-document/, /flatten-document/, /ingest/, /chat/)

🗺️ Roadmap
[x] Phase 1: JWT authentication, password reset flow, session persistence, and dark-mode dashboard UI
[x] Phase 2: Streaming PDF uploads, multi-page viewer, draggable signature tabs, and tokenized guest signing
[x] Phase 3: Django AI service with Presidio spatial PII redaction, clause risk auditing, and live WebSocket progress
[x] Phase 4A: Legal approval gatekeeper, clause redlining, SHA-256 tamper-sealing, and hardened PyMuPDF binary PDF/certificate export
[x] Phase 4B: Zero-Leakage Document Chat (pgvector hybrid search + reversible <SURROGATE> PII masking + page citations)
[ ] Phase 5: Automated test suite (Pytest / Playwright), S3/R2 object storage, and Docker Compose deployment
