import { FastifyInstance } from "fastify";
import { pool } from "../db.js";

export async function healthRoutes(server: FastifyInstance) {
  server.get("/health", async () => {
    const dbRes = await pool.query("SELECT NOW()");
    return {
      status: "ok",
      service: "DocuShield AI Backend",
      dbTime: dbRes.rows[0].now,
    };
  });
}
