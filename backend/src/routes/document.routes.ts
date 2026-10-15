import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import crypto from "node:crypto";
import path from "node:path";
import { pool } from "../db.js";
import "@fastify/multipart";
import { auditQueue, redisConnection } from "../queues/audit.queue.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

interface IdParam {
  Params: { id: string };
}

interface ClausePatchParam {
  Params: { id: string; clauseId: string };
  Body: {
    status: "accepted" | "rejected" | "customized";
    customText?: string;
  };
}

interface SignersPostParam {
  Params: { id: string };
  Body: {
    email: string;
    full_name: string;
    role?: string;
    signing_order?: number;
  };
}

interface TabsPostParam {
  Params: { id: string };
  Body: {
    tabs: Array<{
      id?: string;
      signer_id?: string | null;
      tab_type: string;
      page_number: number;
      pos_x: number;
      pos_y: number;
      width?: number;
      height?: number;
      is_required?: boolean;
    }>;
  };
}

interface TokenParam {
  Params: { token: string };
}

export async function documentRoutes(
  server: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // 1. UPLOAD DOCUMENT
  server.post(
    "/upload",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: "No file uploaded." });
      }

      if (data.mimetype !== "application/pdf") {
        return reply
          .status(400)
          .send({ error: "Only PDF documents are supported." });
      }

      const uniqueId = crypto.randomUUID();
      const sanitizedFilename = `${uniqueId}-${path.basename(data.filename)}`;
      const savePath = path.join(UPLOADS_DIR, sanitizedFilename);

      let bytesWritten = 0;
      try {
        await pipeline(
          data.file,
          fs.createWriteStream(savePath).on("data", (chunk) => {
            bytesWritten += chunk.length;
          }),
        );

        const stat = await fs.promises.stat(savePath);

        const title =
          (data.fields?.title as any)?.value ||
          data.filename.replace(/\.pdf$/i, "");

        const result = await pool.query(
          `INSERT INTO documents 
            (user_id, title, original_filename, file_path, file_size_bytes, mime_type, status, approval_status)
           VALUES ($1, $2, $3, $4, $5, $6, 'uploaded', 'draft')
           RETURNING id, title, original_filename, file_path, file_size_bytes, mime_type, status, approval_status, created_at`,
          [
            request.user.id,
            title,
            data.filename,
            `/uploads/${sanitizedFilename}`,
            stat.size,
            data.mimetype,
          ],
        );

        return reply.status(201).send({
          message: "Document uploaded successfully",
          document: result.rows[0],
        });
      } catch (err) {
        if (fs.existsSync(savePath)) {
          await fs.promises.unlink(savePath);
        }
        server.log.error(err);
        return reply
          .status(500)
          .send({ error: "Failed to process document upload." });
      }
    },
  );

  // 2. GET CURRENT USER'S DOCUMENTS
  server.get(
    "/",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await pool.query(
        `SELECT id, title, original_filename, file_path, file_size_bytes, status, approval_status, risk_score, audit_status, page_count, created_at 
         FROM documents 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [request.user.id],
      );

      return reply.send({ documents: result.rows });
    },
  );

  // 3. GET SINGLE DOCUMENT DETAILS
  server.get<IdParam>(
    "/:id",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      const { id } = request.params;

      const docResult = await pool.query(
        `SELECT * FROM documents WHERE id = $1 AND user_id = $2`,
        [id, request.user.id],
      );

      if (docResult.rows.length === 0) {
        return reply.status(404).send({ error: "Document not found." });
      }

      const signersResult = await pool.query(
        `SELECT * FROM signers WHERE document_id = $1 ORDER BY signing_order ASC`,
        [id],
      );

      return reply.send({
        document: docResult.rows[0],
        signers: signersResult.rows,
      });
    },
  );

  // 4. GET TABS FOR A DOCUMENT
  server.get<IdParam>(
    "/:id/tabs",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      const { id } = request.params;

      const result = await pool.query(
        `SELECT t.*, s.full_name as signer_name, s.email as signer_email
         FROM signature_tabs t
         LEFT JOIN signers s ON t.signer_id = s.id
         WHERE t.document_id = $1
         ORDER BY t.page_number ASC, t.created_at ASC`,
        [id],
      );

      return reply.send({ tabs: result.rows });
    },
  );

  // 5. SAVE / REPLACE TABS FOR A DOCUMENT
  server.post<TabsPostParam>(
    "/:id/tabs",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest<TabsPostParam>, reply: FastifyReply) => {
      const { id } = request.params;
      const { tabs } = request.body || {};

      if (!Array.isArray(tabs)) {
        return reply
          .status(400)
          .send({ error: "Tabs payload must be an array." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query(
          "DELETE FROM signature_tabs WHERE document_id = $1 AND value IS NULL",
          [id],
        );

        for (const tab of tabs) {
          await client.query(
            `INSERT INTO signature_tabs 
              (document_id, signer_id, tab_type, page_number, pos_x, pos_y, width, height, is_required)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              id,
              tab.signer_id || null,
              tab.tab_type,
              tab.page_number,
              tab.pos_x,
              tab.pos_y,
              tab.width || 130,
              tab.height || 42,
              tab.is_required ?? true,
            ],
          );
        }

        await client.query("COMMIT");

        const savedTabs = await client.query(
          `SELECT t.*, s.full_name as signer_name 
           FROM signature_tabs t 
           LEFT JOIN signers s ON t.signer_id = s.id 
           WHERE t.document_id = $1`,
          [id],
        );

        return reply.status(200).send({
          message: "Tabs synchronized successfully",
          tabs: savedTabs.rows,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        server.log.error(err);
        return reply
          .status(500)
          .send({ error: "Failed to synchronize signature tabs." });
      } finally {
        client.release();
      }
    },
  );

  // 6. ADD RECIPIENT / SIGNER TO ENVELOPE (PROTECTED BY LEGAL APPROVAL GATE)
  server.post<SignersPostParam>(
    "/:id/signers",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest<SignersPostParam>, reply: FastifyReply) => {
      const { id } = request.params;
      const {
        email,
        full_name,
        role = "signer",
        signing_order = 1,
      } = request.body || {};

      if (!email || !full_name) {
        return reply
          .status(400)
          .send({ error: "Email and full name are required." });
      }

      const docRes = await pool.query(
        `SELECT id, approval_status, risk_score 
         FROM documents 
         WHERE id = $1 AND user_id = $2`,
        [id, request.user.id],
      );

      if (docRes.rowCount === 0) {
        return reply.status(404).send({ error: "Document not found." });
      }

      const document = docRes.rows[0];

      if (document.approval_status === "rejected") {
        return reply.status(403).send({
          error: "Signing Release Blocked",
          message:
            "This document was rejected during legal review. You cannot add recipients until issues are remediated.",
        });
      }

      const unresolvedRisks = await pool.query(
        `SELECT COUNT(*)::int AS count 
         FROM document_clauses 
         WHERE document_id = $1 
           AND risk_level = 'High' 
           AND status = 'pending'`,
        [id],
      );

      const highRiskCount = unresolvedRisks.rows[0].count;

      if (highRiskCount > 0 && document.approval_status !== "approved") {
        return reply.status(403).send({
          error: "Signing Release Blocked",
          message: `This document has ${highRiskCount} unmitigated High Risk clause(s). A Legal Counsel or Admin must approve redlines before signers can be added.`,
        });
      }

      const token = crypto.randomBytes(32).toString("hex");

      const result = await pool.query(
        `INSERT INTO signers (document_id, email, full_name, role, signing_order, token, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id, document_id, email, full_name, role, signing_order, token, status, created_at`,
        [id, email, full_name, role, signing_order, token],
      );

      await pool.query(
        `UPDATE documents SET status = 'pending' WHERE id = $1 AND status = 'uploaded'`,
        [id],
      );

      return reply.status(201).send({
        message: "Signer added successfully",
        signer: result.rows[0],
      });
    },
  );

  // 7. PUBLIC SIGNING PORTAL RESOLUTION BY TOKEN
  server.get<TokenParam>(
    "/sign/:token",
    async (request: FastifyRequest<TokenParam>, reply: FastifyReply) => {
      const { token } = request.params;

      const signerResult = await pool.query(
        `SELECT s.*, d.title as document_title, d.file_path, d.status as document_status, d.approval_status
         FROM signers s
         JOIN documents d ON s.document_id = d.id
         WHERE s.token = $1`,
        [token],
      );

      if (signerResult.rowCount === 0) {
        return reply
          .status(404)
          .send({ error: "Invalid or expired signing link." });
      }

      const signer = signerResult.rows[0];

      if (signer.approval_status === "rejected") {
        return reply.status(403).send({
          error: "Document Unavailable",
          message:
            "This agreement has been placed on hold or rejected by legal counsel.",
        });
      }

      const tabsResult = await pool.query(
        `SELECT * FROM signature_tabs 
         WHERE document_id = $1 AND (signer_id = $2 OR signer_id IS NULL)
         ORDER BY page_number ASC`,
        [signer.document_id, signer.id],
      );

      return reply.send({
        signer: {
          id: signer.id,
          email: signer.email,
          full_name: signer.full_name,
          role: signer.role,
          status: signer.status,
        },
        document: {
          id: signer.document_id,
          title: signer.document_title,
          file_path: signer.file_path,
          status: signer.document_status,
          approval_status: signer.approval_status,
        },
        tabs: tabsResult.rows,
      });
    },
  );

  // 8. TRIGGER AI PII SCAN & RISK AUDIT (ASYNC via BullMQ)
  server.post<IdParam>(
    "/:id/audit",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      const { id } = request.params;

      const docResult = await pool.query(
        "SELECT * FROM documents WHERE id = $1 AND user_id = $2",
        [id, request.user.id],
      );

      if (docResult.rows.length === 0) {
        return reply.status(404).send({ error: "Document not found." });
      }

      const document = docResult.rows[0];

      const job = await auditQueue.add(
        "document-audit",
        {
          documentId: document.id,
          userId: request.user.id,
          filePath: document.file_path,
          originalFilename: document.original_filename,
        },
        {
          removeOnComplete: 100,
          removeOnFail: 500,
        },
      );

      await pool.query(
        `UPDATE documents 
         SET audit_status = 'queued', audit_job_id = $1 
         WHERE id = $2`,
        [job.id, id],
      );

      return reply.status(202).send({
        message: "Audit job queued successfully.",
        documentId: id,
        jobId: job.id,
        status: "queued",
      });
    },
  );

  // 9. GET AUDIT FINDINGS AND DETECTED REDACTIONS
  server.get<IdParam>(
    "/:id/audit",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      const { id } = request.params;

      const [auditResult, entitiesResult] = await Promise.all([
        pool.query(
          "SELECT * FROM audit_logs WHERE document_id = $1 ORDER BY created_at DESC LIMIT 1",
          [id],
        ),
        pool.query(
          "SELECT * FROM redaction_entities WHERE document_id = $1 ORDER BY page_number ASC",
          [id],
        ),
      ]);

      return reply.send({
        audit: auditResult.rows[0] || null,
        entities: entitiesResult.rows,
      });
    },
  );

  // 10. REAL-TIME AUDIT PROGRESS WEBSOCKET
  server.get<IdParam>(
    "/:id/audit/stream",
    { websocket: true },
    async (socket, req: FastifyRequest<IdParam>) => {
      const { id } = req.params;
      const subRedis = redisConnection.duplicate();

      await subRedis.subscribe(`audit-progress:${id}`);

      subRedis.on("message", (_channel, message) => {
        socket.send(message);
      });

      socket.on("close", async () => {
        await subRedis.unsubscribe(`audit-progress:${id}`);
        subRedis.quit();
      });
    },
  );

  // 11. GET DOCUMENT CLAUSES & REDLINE STATE
  server.get<IdParam>(
    "/:id/clauses",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest<IdParam>, reply: FastifyReply) => {
      const { id } = request.params;

      const docCheck = await pool.query(
        "SELECT id FROM documents WHERE id = $1 AND user_id = $2",
        [id, request.user.id],
      );

      if (docCheck.rowCount === 0) {
        return reply.status(404).send({ error: "Document not found." });
      }

      const result = await pool.query(
        `SELECT id, document_id, category, risk_level, original_text, 
                proposed_remediation, current_text, status, explanation, created_at, updated_at
         FROM document_clauses 
         WHERE document_id = $1 
         ORDER BY 
           CASE risk_level 
             WHEN 'High' THEN 1 
             WHEN 'Medium' THEN 2 
             WHEN 'Low' THEN 3 
             ELSE 4 
           END, 
           created_at ASC`,
        [id],
      );

      return reply.send({ clauses: result.rows });
    },
  );

  // 12. UPDATE CLAUSE REMEDIATION STATUS (Accept, Reject, Customize)
  server.patch<ClausePatchParam>(
    "/:id/clauses/:clauseId",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest<ClausePatchParam>, reply: FastifyReply) => {
      const { id, clauseId } = request.params;
      const { status: newStatus, customText } = request.body || {};

      if (!["accepted", "rejected", "customized"].includes(newStatus)) {
        return reply.status(400).send({
          error:
            "Invalid status. Must be 'accepted', 'rejected', or 'customized'.",
        });
      }

      const docCheck = await pool.query(
        "SELECT id FROM documents WHERE id = $1 AND user_id = $2",
        [id, request.user.id],
      );

      if (docCheck.rowCount === 0) {
        return reply.status(404).send({ error: "Document not found." });
      }

      const clauseResult = await pool.query(
        "SELECT * FROM document_clauses WHERE id = $1 AND document_id = $2",
        [clauseId, id],
      );

      if (clauseResult.rowCount === 0) {
        return reply.status(404).send({ error: "Clause not found." });
      }

      const clause = clauseResult.rows[0];
      let updatedText = clause.current_text;

      if (newStatus === "accepted") {
        updatedText = clause.proposed_remediation;
      } else if (newStatus === "rejected") {
        updatedText = clause.original_text;
      } else if (newStatus === "customized") {
        if (!customText || !customText.trim()) {
          return reply.status(400).send({
            error: "customText must be provided when status is 'customized'.",
          });
        }
        updatedText = customText.trim();
      }

      const updateResult = await pool.query(
        `UPDATE document_clauses 
         SET status = $1, current_text = $2, updated_at = NOW() 
         WHERE id = $3 AND document_id = $4 
         RETURNING *`,
        [newStatus, updatedText, clauseId, id],
      );

      return reply.send({
        message: `Clause successfully updated to '${newStatus}'.`,
        clause: updateResult.rows[0],
      });
    },
  );
}
