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
}
