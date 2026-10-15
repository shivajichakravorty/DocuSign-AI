import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { pool } from "../db.js";
import { requireRole } from "../middleware/rbac.js";

interface TriageRouteGeneric {
  Params: { id: string };
  Body: {
    decision: "approved" | "rejected";
    comments?: string;
  };
}

export async function approvalRoutes(server: FastifyInstance) {
  // APPROVE OR REJECT A DOCUMENT FOR SIGNING
  server.post<TriageRouteGeneric>(
    "/:id/triage",
    { preHandler: [requireRole("legal_counsel")] },
    async (
      request: FastifyRequest<TriageRouteGeneric>,
      reply: FastifyReply,
    ) => {
      const { id } = request.params;
      const { decision, comments } = request.body || {};
      const reviewerId = request.user?.id;

      if (!reviewerId) {
        return reply
          .status(401)
          .send({ error: "Unauthorized: Missing user identity" });
      }

      if (!decision || !["approved", "rejected"].includes(decision)) {
        return reply
          .status(400)
          .send({ error: "Decision must be 'approved' or 'rejected'." });
      }

      // Hard gate: Check for unresolved high-risk clauses before approving
      if (decision === "approved") {
        const pendingRisks = await pool.query(
          `SELECT COUNT(*)::int AS count 
           FROM document_clauses 
           WHERE document_id = $1 
             AND risk_level = 'High' 
             AND status = 'pending'`,
          [id],
        );

        if (pendingRisks.rows[0].count > 0) {
          return reply.status(409).send({
            error: "Approval Gate Blocked",
            message: `Cannot approve document with ${pendingRisks.rows[0].count} unmitigated High Risk clause(s). Resolve pending redlines first.`,
          });
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        // Record audit decision
        await client.query(
          `INSERT INTO document_approvals (document_id, reviewer_id, decision, comments)
           VALUES ($1, $2, $3, $4)`,
          [id, reviewerId, decision, comments || null],
        );

        // Update document status
        const docRes = await client.query(
          `UPDATE documents 
           SET approval_status = $1, updated_at = NOW() 
           WHERE id = $2 
           RETURNING *`,
          [decision, id],
        );

        await client.query("COMMIT");

        return reply.send({
          message: `Document successfully marked as ${decision}.`,
          document: docRes.rows[0],
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    },
  );
}
