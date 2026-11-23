import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import path from "node:path";
import crypto from "node:crypto";
import { pool } from "../db.js";
import {
  computeFileHash,
  computeSignatureChecksum,
} from "../services/crypto.service.js";

interface CompleteSigningBody {
  tabValues: Array<{
    tabId: string;
    value: string; // Base64 signature SVG/PNG or text value
  }>;
}

export async function signingRoutes(server: FastifyInstance) {
  // 1. SUBMIT SIGNATURE & RECORD AUDIT RECORD
  server.post<{
    Params: { token: string };
    Body: CompleteSigningBody;
  }>(
    "/sign/:token/submit",
    async (
      request: FastifyRequest<{
        Params: { token: string };
        Body: CompleteSigningBody;
      }>,
      reply: FastifyReply,
    ) => {
      const { token } = request.params;
      const { tabValues } = request.body || {};

      if (!Array.isArray(tabValues) || tabValues.length === 0) {
        return reply
          .status(400)
          .send({ error: "Missing signature tab values." });
      }

      // Fetch signer & document
      const signerRes = await pool.query(
        `SELECT s.*, d.id as doc_id, d.file_path, d.status as doc_status, d.pre_sign_hash 
         FROM signers s 
         JOIN documents d ON s.document_id = d.id 
         WHERE s.token = $1`,
        [token],
      );

      if (signerRes.rowCount === 0) {
        return reply
          .status(404)
          .send({ error: "Invalid or expired signing session." });
      }

      const signer = signerRes.rows[0];

      if (signer.status === "completed" || signer.status === "signed") {
        return reply.status(409).send({
          error: "Already Signed",
          message: "This signing link has already been completed.",
        });
      }

      const docId = signer.doc_id;
      const ipAddress =
        (request.headers["x-forwarded-for"] as string) ||
        request.ip ||
        "127.0.0.1";
      const userAgent = request.headers["user-agent"] || "Unknown";
      const nowIso = new Date().toISOString();

      const absoluteFilePath = path.resolve(
        process.cwd(),
        `.${signer.file_path}`,
      );

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Compute pre-signing hash if not already recorded
        let preHash = signer.pre_sign_hash;
        if (!preHash) {
          preHash = await computeFileHash(absoluteFilePath);
          await client.query(
            "UPDATE documents SET pre_sign_hash = $1 WHERE id = $2",
            [preHash, docId],
          );
        }

        // Apply tab values and record telemetry in signature_audit_trail
        for (const item of tabValues) {
          const checksum = computeSignatureChecksum(
            signer.id,
            item.value,
            ipAddress,
            userAgent,
            nowIso,
          );

          await client.query(
            "UPDATE signature_tabs SET value = $1 WHERE id = $2 AND document_id = $3",
            [item.value, item.tabId, docId],
          );

          await client.query(
            `INSERT INTO signature_audit_trail 
              (document_id, signer_id, tab_id, ip_address, user_agent, action, tab_value, signature_checksum, timestamp)
             VALUES ($1, $2, $3, $4, $5, 'signed', $6, $7, $8)`,
            [
              docId,
              signer.id,
              item.tabId,
              ipAddress,
              userAgent,
              item.value,
              checksum,
              nowIso,
            ],
          );
        }

        // Mark signer completed
        await client.query(
          "UPDATE signers SET status = 'completed', signed_at = NOW() WHERE id = $1",
          [signer.id],
        );

        // Check if all signers are done
        const pendingSigners = await client.query(
          "SELECT COUNT(*)::int AS count FROM signers WHERE document_id = $1 AND status != 'completed'",
          [docId],
        );

        const allCompleted = pendingSigners.rows[0].count === 0;

        if (allCompleted) {
          // Compute final post-signing document hash (tamper-seal)
          const postHash = await computeFileHash(absoluteFilePath);
          const certNumber = `CERT-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;

          await client.query(
            `UPDATE documents 
             SET status = 'completed', 
                 post_sign_hash = $1, 
                 sealed_at = NOW() 
             WHERE id = $2`,
            [postHash, docId],
          );

          // Generate Certificate of Completion
          const auditRecords = await client.query(
            `SELECT a.*, s.full_name, s.email 
             FROM signature_audit_trail a
             JOIN signers s ON a.signer_id = s.id
             WHERE a.document_id = $1
             ORDER BY a.timestamp ASC`,
            [docId],
          );

          await client.query(
            `INSERT INTO completion_certificates 
              (document_id, certificate_number, pre_sign_hash, post_sign_hash, total_signers, certificate_data)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              docId,
              certNumber,
              preHash,
              postHash,
              auditRecords.rows.length,
              JSON.stringify({
                certificateNumber: certNumber,
                documentId: docId,
                preSignHash: preHash,
                postSignHash: postHash,
                auditTrail: auditRecords.rows,
                sealedAt: nowIso,
              }),
            ],
          );
        }

        await client.query("COMMIT");

        return reply.send({
          success: true,
          message: allCompleted
            ? "Document successfully completed and cryptographically sealed."
            : "Signature submitted.",
          isFullySigned: allCompleted,
        });
      } catch (err) {
        await client.query("ROLLBACK");
        server.log.error(err);
        return reply
          .status(500)
          .send({ error: "Failed to submit cryptographic signature." });
      } finally {
        client.release();
      }
    },
  );

  // 2. VERIFY DOCUMENT INTEGRITY & TAMPER DETECTION
  server.get<{ Params: { id: string } }>(
    "/verify/:id",
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;

      const docRes = await pool.query(
        `SELECT id, title, file_path, pre_sign_hash, post_sign_hash, sealed_at, status 
         FROM documents 
         WHERE id = $1`,
        [id],
      );

      if (docRes.rowCount === 0) {
        return reply.status(404).send({ error: "Document not found." });
      }

      const doc = docRes.rows[0];
      const absoluteFilePath = path.resolve(process.cwd(), `.${doc.file_path}`);
      const currentDiskHash = await computeFileHash(absoluteFilePath);

      const targetHash = doc.post_sign_hash || doc.pre_sign_hash;
      const isTampered = Boolean(targetHash && currentDiskHash !== targetHash);

      const certRes = await pool.query(
        "SELECT * FROM completion_certificates WHERE document_id = $1",
        [id],
      );

      const auditRes = await pool.query(
        `SELECT a.id, a.ip_address, a.user_agent, a.action, a.signature_checksum, a.timestamp,
                s.full_name, s.email
         FROM signature_audit_trail a
         JOIN signers s ON a.signer_id = s.id
         WHERE a.document_id = $1
         ORDER BY a.timestamp ASC`,
        [id],
      );

      return reply.send({
        documentId: doc.id,
        title: doc.title,
        status: doc.status,
        preSignHash: doc.pre_sign_hash,
        postSignHash: doc.post_sign_hash,
        currentDiskHash,
        isTampered,
        sealedAt: doc.sealed_at,
        certificate: certRes.rows[0] || null,
        auditTrail: auditRes.rows,
      });
    },
  );
}
