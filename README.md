# 🛡️ DocuShield AI

**DocuShield AI** is a privacy-first digital document signing and contract-auditing platform. It combines an interactive multi-party e-signature workflow with an automated AI security engine that detects Personally Identifiable Information (PII), flags hidden legal liabilities, enforces legal approval gates, and seals executed agreements with cryptographic SHA-256 integrity certificates.

---

## ✨ Key Features

### 🔐 Authentication & Multi-Tenant Access
* End-to-end user registration and login with `bcryptjs` password hashing, signed JWT tokens, and HTTP-only session cookies.
* Protected client routes, custom authentication hooks (`useAuth`), and strict per-user document isolation.

### 📄 Interactive Signing & Envelope Workspace
* **Streaming Document Ingestion:** High-throughput `@fastify/multipart` file uploads streamed directly to storage via `pipeline()` with MIME-type and size validation.
* **Multi-Page PDF Canvas:** In-browser PDF rendering (`react-pdf` / `pdfjs-dist`) with zoom controls and responsive percentage-based $(X, Y)$ coordinate overlays.
* **Draggable Field Placement:** Place, drag, and atomically synchronize `signature`, `initials`, `date`, and `text` tabs across pages.
* **Tokenized Guest Signing Portal:** Generate cryptographically secure 32-byte signing tokens (`/sign/:token`) so external recipients can review and execute agreements without creating an account.

### 🛡️ AI Privacy & Legal Risk Engine (`ai-service`)
* **Spatial PII Detection & Visual Shielding:** Powered by **Microsoft Presidio**, **spaCy NER** (`en_core_web_sm`), and **`pdfplumber`** to detect sensitive entities (SSNs, emails, names, URLs) and map them to normalized page bounding boxes $[x, y, w, h]$ with a live **"Shield View"** toggle.
* **Contract Clause Risk Auditing & Redlining:** Automated legal risk inspection flagging missing limitation-of-liability clauses, broad indemnification traps, and one-sided terms—computing a dynamic **Compliance Score (0–100)** and risk tier (`Low`, `Medium`, `High`) alongside interactive clause redlining.
* **Legal Approval Gatekeeper:** Blocks external signing invites on `High` risk or rejected agreements until Legal Counsel approves the redlines.
* **Asynchronous Job Tracking:** Background audit processing via **BullMQ + Redis** with real-time progress streaming over WebSockets.

### 🔒 Cryptographic Integrity & Hardened PDF Export
* **SHA-256 Tamper Sealing:** Records pre-signing and post-signing SHA-256 document digests alongside an immutable signer audit trail (IP address, user agent, UTC timestamps, signature checksums).
* **Binary Stream Redaction & Flattening (`PyMuPDF`):** Scrubs masked PII characters directly from the underlying PDF content stream, permanently burns placed signatures onto pages, and appends a cryptographic **Certificate of Completion** page for both **Redacted PDF** and **Executed PDF** exports.

---

## 🏗️ System Architecture

```text
┌──────────────────────────────────────────────────────────┐
│              React + Vite Frontend (TypeScript)          │
│  • Split-Pane PDF Viewer & Bounding-Box Shield Overlays  │
│  • Draggable Signature Tabs & Guest Signing Portal       │
│  • AI Risk Drawer, Clause Redliner & Audit Seal Modal    │
└─────────────────────────────┬────────────────────────────┘
                              │ REST / WebSockets
┌─────────────────────────────▼────────────────────────────┐
│             Fastify Edge Gateway (Node.js)               │
│  • JWT Auth & Legal Approval Gate Enforcement            │
│  • Streaming Multipart Uploads & Hardened PDF Exports    │
│  • BullMQ + Redis Async Job Dispatcher & WS Pub/Sub      │
└──────────────┬────────────────────────────┬──────────────┘
               │                            │ HTTP / Multipart
┌──────────────▼──────────────┐  ┌──────────▼──────────────┐
│    PostgreSQL Database      │  │   Django AI Service     │
│  • Users, Docs & Signers    │  │  • Presidio + spaCy NER │
│  • Signature Tabs & Clauses │  │  • pdfplumber Extractor │
│  • Redactions & Audit Logs  │  │  • Clause Risk Auditor  │
│  • SHA-256 Seals & Certs    │  │  • PyMuPDF Flattener    │
└─────────────────────────────┘  └─────────────────────────┘


🛠️ Tech Stack
Frontend: React 18+, TypeScript, Vite, Tailwind CSS, react-pdf, Lucide Icons, Axios
API Gateway: Node.js, Fastify, @fastify/jwt, @fastify/multipart, @fastify/websocket, BullMQ, Redis
AI & PDF Microservice: Python 3, Django, Django REST Framework, Microsoft Presidio, spaCy, pdfplumber, PyMuPDF (fitz)
Database: PostgreSQL (uuid-ossp, pgcrypto, relational schemas & JSONB audit trails)

docushield-ai/
├── frontend/                   # React + Vite + TypeScript Client
│   └── src/
│       ├── api/                # Axios client with auth interceptors
│       ├── components/         # Layout, Dashboard, ClauseRedlineManager, AuditCertificateModal
│       ├── context/            # AuthContext session state
│       ├── pages/              # Login, Register, Dashboard, DocumentWorkspace, SigningPortal
│       └── types/              # Strict TypeScript interfaces
│
├── backend/                    # Fastify + TypeScript Edge Gateway
│   ├── uploads/                # Local PDF storage
│   └── src/
│       ├── plugins/            # JWT & cookie auth decorators
│       ├── queues/             # BullMQ audit queue & worker
│       ├── routes/             # auth, document, approval, signing, and export routes
│       ├── db.ts               # PostgreSQL connection pool
│       └── server.ts           # Fastify server entrypoint
│
└── ai-service/                 # Python + Django AI & Security Microservice
    ├── config/                 # Django settings & URL routing
    └── shield/
        ├── extractor.py        # pdfplumber + Presidio spatial PII bounding-box extractor
        ├── auditor.py          # Contract clause risk evaluator & compliance scoring
        ├── flattener.py        # PyMuPDF binary redaction, signature burning & certificate builder
        └── views.py            # DRF API endpoints (/scan-document/, /flatten-document/)

🚀 Getting Started
Prerequisites
Node.js v18+
Python 3.11+
PostgreSQL 14+

Redis (for BullMQ background audit jobs)

🗺️ Roadmap
[x] Phase 1: JWT authentication, session persistence, and glassmorphic dashboard UI
[x] Phase 2: Streaming PDF uploads, multi-page viewer, draggable signature tabs, and tokenized guest signing
[x] Phase 3: Django AI service with Presidio spatial PII redaction, clause risk auditing, and live WebSocket progress
[x] Phase 4A: Legal approval gatekeeper, clause redlining, SHA-256 tamper-sealing, and hardened PyMuPDF binary PDF/certificate export
[ ] Phase 4B: Privacy-preserving Document Chat (pgvector hybrid search + reversible surrogate token masking)
[ ] Phase 5: Automated test suite (Pytest / Playwright), S3/R2 object storage, and Docker Compose deployment
