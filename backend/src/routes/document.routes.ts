import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { pool } from "../db.js";
import "@fastify/multipart";

import path from "node:path";

const UPLOADS_DIR = path.resolve(process.cwd(), "uploads");

// Ensure uploads directory exists on startup
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export async function documentRoutes(
  server: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // All routes below require a valid JWT token
  server.addHook("preHandler", server.authenticate);

  // 1. UPLOAD DOCUMENT
  server.post(
    "/upload",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const data = await request.file();

      if (!data) {
        return reply.status(400).send({ error: "No file uploaded." });
      }

      // MIME type validation
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
        // Pipe file stream to disk
        await pipeline(
          data.file,
          fs.createWriteStream(savePath).on("data", (chunk) => {
            bytesWritten += chunk.length;
          }),
        );

        // Get exact disk file size
        const stat = await fs.promises.stat(savePath);

        // Extract custom title or fallback to original filename
        const title =
          (data.fields?.title as any)?.value ||
          data.filename.replace(/\.pdf$/i, "");

        // Persist document record in PostgreSQL
        const result = await pool.query(
          `INSERT INTO documents 
          (user_id, title, original_filename, file_path, file_size_bytes, mime_type, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'uploaded')
         RETURNING id, title, original_filename, file_path, file_size_bytes, mime_type, status, created_at`,
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
        // Cleanup orphan file if DB write or streaming failed
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
  server.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const result = await pool.query(
      `SELECT id, title, original_filename, file_path, file_size_bytes, status, page_count, created_at 
       FROM documents 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [request.user.id],
    );

    return reply.send({ documents: result.rows });
  });

  // 3. GET SINGLE DOCUMENT DETAILS
  server.get(
    "/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
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
  server.get(
    "/:id/tabs",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
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
  server.post(
    "/:id/tabs",
    async (
      request: FastifyRequest<{
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
      }>,
      reply: FastifyReply,
    ) => {
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

        // Delete existing uncompleted tabs for this document to synchronize state
        await client.query(
          "DELETE FROM signature_tabs WHERE document_id = $1 AND value IS NULL",
          [id],
        );

        // Bulk insert new tab placements
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

  // 6. ADD RECIPIENT / SIGNER TO ENVELOPE
  server.post(
    "/:id/signers",
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          email: string;
          full_name: string;
          role?: string;
          signing_order?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
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

      // Generate secure 32-byte hexadecimal guest access token
      const token = crypto.randomBytes(32).toString("hex");

      const result = await pool.query(
        `INSERT INTO signers (document_id, email, full_name, role, signing_order, token, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id, document_id, email, full_name, role, signing_order, token, status, created_at`,
        [id, email, full_name, role, signing_order, token],
      );

      // Transition document state to 'pending'
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
  server.get(
    "/sign/:token",
    async (
      request: FastifyRequest<{ Params: { token: string } }>,
      reply: FastifyReply,
    ) => {
      const { token } = request.params;

      const signerResult = await pool.query(
        `SELECT s.*, d.title as document_title, d.file_path, d.status as document_status
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

      // Fetch tabs assigned specifically to this signer
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
        },
        tabs: tabsResult.rows,
      });
    },
  );
  // 8. TRIGGER AI PII SCAN & RISK AUDIT
  server.post(
    "/:id/audit",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;

      // 1. Fetch document record
      const docResult = await pool.query(
        "SELECT * FROM documents WHERE id = $1 AND user_id = $2",
        [id, request.user.id],
      );

      if (docResult.rows.length === 0) {
        return reply.status(404).send({ error: "Document not found." });
      }

      const document = docResult.rows[0];
      const absoluteFilePath = path.resolve(
        process.cwd(),
        `.${document.file_path}`,
      );

      if (!fs.existsSync(absoluteFilePath)) {
        return reply
          .status(404)
          .send({ error: "Target PDF file missing from storage." });
      }

      try {
        // 2. Dispatch request to Django AI microservice
        const aiBaseUrl =
          process.env.AI_SERVICE_URL || "http://127.0.0.1:8000/api";
        const formData = new FormData();
        const fileBuffer = await fs.promises.readFile(absoluteFilePath);
        const blob = new Blob([fileBuffer], { type: "application/pdf" });
        formData.append("file", blob, document.original_filename);

        const aiResponse = await fetch(`${aiBaseUrl}/scan-document/`, {
          method: "POST",
          body: formData,
        });

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          server.log.error(`AI Microservice error: ${errText}`);
          return reply
            .status(502)
            .send({ error: "AI processing service error." });
        }

        const aiData = (await aiResponse.json()) as any;
        const { audit, pages } = aiData;

        const client = await pool.connect();
        try {
          await client.query("BEGIN");

          // Clean up any stale audit or redaction entries for this document
          await client.query(
            "DELETE FROM redaction_entities WHERE document_id = $1",
            [id],
          );
          await client.query("DELETE FROM audit_logs WHERE document_id = $1", [
            id,
          ]);

          // Save Audit Record
          await client.query(
            `INSERT INTO audit_logs (document_id, compliance_score, risk_level, flags_count, flags_data)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              id,
              audit.compliance_score,
              audit.risk_level,
              audit.flags_count,
              JSON.stringify(audit.flags),
            ],
          );

          // Batch insert detected spatial PII entities
          for (const page of pages) {
            for (const entity of page.entities) {
              await client.query(
                `INSERT INTO redaction_entities 
                  (document_id, entity_type, entity_text, confidence, page_number, pos_x, pos_y, width, height)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                [
                  id,
                  entity.type,
                  entity.text,
                  entity.confidence,
                  entity.page_number,
                  entity.bbox.x_percent,
                  entity.bbox.y_percent,
                  entity.bbox.width_percent,
                  entity.bbox.height_percent,
                ],
              );
            }
          }

          // Flag document if risk score is low
          const newStatus =
            audit.risk_level === "High" ? "flagged" : document.status;
          await client.query("UPDATE documents SET status = $1 WHERE id = $2", [
            newStatus,
            id,
          ]);

          await client.query("COMMIT");

          return reply.send({
            message: "Audit completed successfully",
            audit,
            total_entities: aiData.total_entities,
          });
        } catch (dbErr) {
          await client.query("ROLLBACK");
          server.log.error(dbErr);
          return reply
            .status(500)
            .send({ error: "Failed to persist audit scan findings." });
        } finally {
          client.release();
        }
      } catch (networkErr) {
        server.log.error(networkErr);
        return reply
          .status(503)
          .send({ error: "AI microservice unreachable." });
      }
    },
  );

  // 9. GET AUDIT FINDINGS AND DETECTED REDACTIONS
  server.get(
    "/:id/audit",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
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
}
