import { Worker, Job } from "bullmq";
import fs from "node:fs";
import path from "node:path";
import { pool } from "../db.js";
import { redisConnection } from "./audit.queue.js";

interface AuditJobData {
  documentId: string;
  userId: string;
  filePath: string;
  originalFilename: string;
}

interface BoundingBox {
  x_percent: number;
  y_percent: number;
  width_percent: number;
  height_percent: number;
}

interface RedactionEntity {
  type: string;
  text: string;
  confidence: number;
  page_number: number;
  bbox: BoundingBox;
}

interface PageResult {
  page_number: number;
  entities: RedactionEntity[];
}

interface AuditFlag {
  id?: string;
  category?: string;
  risk_level?: "High" | "Medium" | "Low";
  original_text?: string;
  proposed_remediation?: string;
  explanation?: string;
}

interface AuditData {
  compliance_score: number;
  risk_level: string;
  flags_count: number;
  flags: AuditFlag[];
}

interface AiServiceResponse {
  audit: AuditData;
  pages: PageResult[];
}

// Dedicated publisher instance for PubSub
const publisher = redisConnection.duplicate();

async function publishProgress(
  documentId: string,
  stepName: string,
  status: "queued" | "running" | "done" | "error",
  progress: number,
  details: Record<string, unknown> = {},
) {
  try {
    // 1. Persist step in PostgreSQL audit_steps table
    await pool.query(
      `INSERT INTO audit_steps (document_id, step_name, status, details, updated_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [documentId, stepName, status, JSON.stringify(details)],
    );

    // 2. Broadcast via Redis Pub/Sub for WebSockets
    const payload = JSON.stringify({
      documentId,
      step: stepName,
      status,
      progress,
      details,
      timestamp: new Date().toISOString(),
    });

    await publisher.publish(`audit-progress:${documentId}`, payload);
  } catch (err) {
    console.error(`[Worker Progress Error] ${stepName}:`, err);
  }
}

export const auditWorker = new Worker<AuditJobData>(
  "document-audit-queue",
  async (job: Job<AuditJobData>) => {
    const { documentId, filePath, originalFilename } = job.data;
    const absoluteFilePath = path.resolve(process.cwd(), `.${filePath}`);

    try {
      // Step 1: Mark job as started
      await pool.query(
        `UPDATE documents 
         SET audit_status = 'processing', audit_job_id = $1 
         WHERE id = $2`,
        [job.id, documentId],
      );

      await publishProgress(documentId, "file_verification", "running", 10, {
        filename: originalFilename,
      });

      if (!fs.existsSync(absoluteFilePath)) {
        throw new Error(`File missing on disk: ${absoluteFilePath}`);
      }

      await publishProgress(documentId, "file_verification", "done", 25);

      // Step 2: Dispatch to Django AI service
      await publishProgress(documentId, "ai_audit_scan", "running", 35);

      const aiBaseUrl =
        process.env.AI_SERVICE_URL || "http://127.0.0.1:8000/api";
      const fileBuffer = await fs.promises.readFile(absoluteFilePath);
      const blob = new Blob([fileBuffer], { type: "application/pdf" });

      const formData = new FormData();
      formData.append("file", blob, originalFilename);
      formData.append("document_id", documentId); // Connects Django telemetry to documentId

      // Route target (matches Django scan endpoint)
      const aiResponse = await fetch(`${aiBaseUrl}/scan-document/`, {
        method: "POST",
        body: formData,
      });

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        throw new Error(`Django AI service failed: ${errText}`);
      }

      const aiData = (await aiResponse.json()) as AiServiceResponse;
      const { audit, pages } = aiData;

      await publishProgress(documentId, "ai_audit_scan", "done", 75, {
        flagsCount: audit.flags_count,
        riskLevel: audit.risk_level,
      });

      // Step 3: Persist results in PostgreSQL
      await publishProgress(documentId, "database_persistence", "running", 85);

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Clean stale data
        await client.query(
          "DELETE FROM redaction_entities WHERE document_id = $1",
          [documentId],
        );
        await client.query("DELETE FROM audit_logs WHERE document_id = $1", [
          documentId,
        ]);
        await client.query(
          "DELETE FROM document_clauses WHERE document_id = $1",
          [documentId],
        );

        // Insert new audit log
        await client.query(
          `INSERT INTO audit_logs (document_id, compliance_score, risk_level, flags_count, flags_data)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            documentId,
            audit.compliance_score,
            audit.risk_level,
            audit.flags_count,
            JSON.stringify(audit.flags),
          ],
        );

        // Insert redline remediation clauses for Phase 2
        for (const flag of audit.flags || []) {
          if (flag.original_text && flag.proposed_remediation) {
            await client.query(
              `INSERT INTO document_clauses 
                (document_id, category, risk_level, original_text, proposed_remediation, current_text, status, explanation)
               VALUES ($1, $2, $3, $4, $5, $4, 'pending', $6)`,
              [
                documentId,
                flag.category || "General",
                flag.risk_level || "Medium",
                flag.original_text,
                flag.proposed_remediation,
                flag.explanation || "",
              ],
            );
          }
        }

        // Insert redaction bounding boxes
        for (const page of pages || []) {
          for (const entity of page.entities || []) {
            await client.query(
              `INSERT INTO redaction_entities 
                (document_id, entity_type, entity_text, confidence, page_number, pos_x, pos_y, width, height)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
              [
                documentId,
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

        const newDocStatus =
          audit.risk_level === "High" ? "flagged" : "audited";

        // Mark document as completed in documents table
        await client.query(
          `UPDATE documents 
           SET audit_status = 'completed',
               risk_score = $1,
               status = $2,
               completed_at = NOW()
           WHERE id = $3`,
          [audit.compliance_score, newDocStatus, documentId],
        );

        await client.query("COMMIT");
      } catch (dbErr) {
        await client.query("ROLLBACK");
        throw dbErr;
      } finally {
        client.release();
      }

      await publishProgress(documentId, "completed", "done", 100, {
        riskScore: audit.compliance_score,
      });

      return { success: true, documentId };
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown audit worker error";

      await pool.query(
        `UPDATE documents SET audit_status = 'failed' WHERE id = $1`,
        [documentId],
      );

      await publishProgress(documentId, "error", "error", 100, {
        error: errorMessage,
      });

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 5,
  },
);
