# 🛡️ DocuShield AI

**Privacy-First Digital Document Signing, Automated Contract Risk Auditing & PII-Masked RAG Intelligence**

DocuShield AI is a full-stack document execution and legal intelligence platform built around a **zero-leakage privacy architecture**. Before any contract text touches a vector database or external LLM API, sensitive PII is detected locally, spatially redacted and flattened into the PDF binary, and replaced with deterministic surrogate tokens (`<PERSON_1>`, `<EMAIL_ADDRESS_1>`) that re-hydrate exclusively on the user's client.

---

## ✨ Core Capabilities

- **Spatial PII Redaction & Binary Flattening (`Shield View`):** Uses Microsoft Presidio + spaCy NLP to locate sensitive entities with bounding-box coordinates and permanently flattens redactions into the PDF via PyMuPDF (`fitz`), preventing copy-paste or metadata recovery.
- **Zero-Leakage Hybrid RAG Document Chat:**
  - Extracts selectable text via `pdfplumber` with automatic **Tesseract OCR fallback** for scanned PDFs.
  - Masks PII into reversible surrogate tokens prior to embedding and LLM inference.
  - Combines **384-dim local embeddings** (`BAAI/bge-small-en-v1.5` via FastEmbed) in PostgreSQL `pgvector` (75% cosine similarity) with PostgreSQL full-text search (`ts_rank_cd`, 25%) for accurate, page-cited answers.
- **Automated Clause Risk Auditing & Redline Generation:** Hybrid deterministic regex rules + **Gemini 3.8 Flash** legal remediation engine flag uncapped liability, broad indemnification, unilateral termination, and IP overreach—generating balanced fallback clauses and a live `0–100` compliance score.
- **Cryptographic Signature Audit Trail:** Interactive signature/initial/date field placement with **SHA-256 tamper-sealing** and JWT-authenticated multi-party signing workflows.
- **Production-Grade Resilience:** Asynchronous background audit queues (`Redis` + `BullMQ`), real-time UI progress tracking, bounded exponential backoff with jitter for transient upstream `503`/`429` spikes, and graceful quota fallback.

---

## 🏗️ System Architecture

DocuShield AI runs as a 5-container microservices stack orchestrated via Docker Compose:

```text
┌─────────────────────────┐      REST / JWT      ┌─────────────────────────┐
│  docushield-frontend    │ ───────────────────▶ │   docushield-backend    │
│  React • TS • Vite      │                      │  Node.js • Fastify • TS │
│  Tailwind CSS           │ ◀─────────────────── │  SHA-256 • BullMQ       │
└─────────────────────────┘   Live Scan Status   └───────────┬─────────────┘
                                                             │
                                     ┌───────────────────────┼───────────────────────┐
                                     ▼                       ▼                       ▼
                       ┌───────────────────────┐ ┌───────────────────────┐ ┌───────────────────────┐
                       │   docushield-redis    │ │    docushield-db      │ │    docushield-ai      │
                       │   BullMQ Job Queue    │ │  PostgreSQL 16        │ │  Python • Django      │
                       │                       │ │  pgvector + FTS       │ │  Presidio • PyMuPDF   │
                       └───────────────────────┘ └───────────────────────┘ │  FastEmbed • Gemini   │
                                                                           └───────────────────────┘
```

| Service | Container | Stack | Responsibility |
| :--- | :--- | :--- | :--- |
| **Frontend** | `docushield-frontend` | React, TypeScript, Vite, Tailwind CSS | Document dashboard, interactive PDF field placement, Shield View redaction toggles, and cited RAG chat |
| **Edge Gateway** | `docushield-backend` | Node.js, Fastify, TypeScript | Authentication (JWT), file uploads, SHA-256 document hashing, audit trails, and BullMQ job dispatch |
| **AI Microservice** | `docushield-ai` | Python 3.12, Django, Presidio, PyMuPDF, FastEmbed, Google GenAI | Spatial PII redaction, OCR fallback, local vector embeddings, hybrid search, and Gemini clause remediation |
| **Database** | `docushield-db` | PostgreSQL 16 + `pgvector` | Relational document/audit state, 384-dim vector storage, GIN full-text index, and local surrogate maps |
| **Queue Broker** | `docushield-redis` | Redis | Asynchronous background audit & ingestion job orchestration |

---

## 🚀 Quickstart (Docker Compose)

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with Docker Compose v2)
- A Google AI Studio API key (`GEMINI_API_KEY`)

### 1. Clone & Configure Environment
```bash
git clone [https://github.com/shivajichakravorty/DocuSign-AI.git](https://github.com/shivajichakravorty/DocuShield-AI.git)
cd DocuShield-AI
cp .env.example .env
```

Update `.env` with your credentials:
```env
GEMINI_API_KEY=your_gemini_api_key_here
JWT_SECRET=your_super_secret_jwt_key
DB_NAME=docushield
DB_USER=postgres
DB_PASSWORD=postgres
DB_HOST=docushield-db
DB_PORT=5432
```

### 2. Build & Launch All 5 Containers
```bash
docker compose up -d --build
```

Verify all services are healthy:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

- **Frontend Workspace:** `http://localhost:5173`
- **Backend API Gateway:** `http://localhost:3000`
- **AI Microservice:** `http://localhost:8000`

---

## 🧪 Automated Test Suite

DocuShield AI is verified across all three layers of the testing pyramid:

### 1. AI & Privacy Unit Tests (`pytest`)
Tests Presidio surrogate PII masking, re-hydration integrity, and contract clause risk detection:
```bash
cd ai-service
source venv/bin/activate
pytest
```

### 2. Backend Security & Integrity Tests (`Vitest`)
Tests SHA-256 document tamper-detection hashing and JWT verification:
```bash
cd backend
npm test
```

### 3. End-to-End Browser Tests (`Playwright`)
Tests unauthenticated route protection, login flows, and live dashboard workspace rendering against the running stack:
```bash
cd frontend
npx playwright test --config=playwright.config.ts
```

---

## 🔐 Privacy & Security Design Decisions

- **No Raw PII Sent to External LLMs:** All names, emails, phone numbers, and identifiers are substituted with deterministic tokens (`<PERSON_1>`) in PostgreSQL before prompts are constructed.
- **Local Embedding Generation:** Document chunks are embedded inside `docushield-ai` using `BAAI/bge-small-en-v1.5` so raw contract text never leaves your infrastructure during indexing.
- **Tamper-Evident Execution:** Finalized documents are hashed with SHA-256 and recorded in an immutable execution audit trail.

---

## 👤 Author

**Shivaji Chakravorty**  
- GitHub: [@shivajichakravorty](https://github.com/shivajichakravorty)  
- LinkedIn: [Shivaji Chakravorty](https://www.linkedin.com/in/shivaji-chakravorty-585945372/)
