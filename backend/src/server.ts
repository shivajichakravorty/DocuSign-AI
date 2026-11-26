import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import rateLimit from "@fastify/rate-limit";
import path from "node:path";
import "dotenv/config";

// Initialize BullMQ worker
import "./queues/audit.worker.js";
import { redisConnection } from "./queues/audit.queue.js";

import authPlugin from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { documentRoutes } from "./routes/document.routes.js";
import { approvalRoutes } from "./routes/approval.routes.js";
import { signingRoutes } from "./routes/signing.routes.js";

const uploadsDir = path.resolve(process.cwd(), "uploads");
const server = Fastify({ logger: true });

async function buildServer() {
  // 1. WebSocket Support
  await server.register(websocket);

  // 2. CORS
  await server.register(cors, {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  });

  // 3. Rate Limiting
  await server.register(rateLimit, {
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: "Too Many Requests",
      message: `Rate limit exceeded. Try again in ${Math.ceil(context.ttl / 1000)} seconds.`,
    }),
  });

  // 4. Multipart Plugin (Registered before routes)
  await server.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20 MB
    },
  });

  // 5. Static Files (Uploaded PDFs)
  await server.register(fastifyStatic, {
    root: uploadsDir,
    prefix: "/uploads/",
    decorateReply: false,
    setHeaders: (reply) => {
      reply.header(
        "Access-Control-Allow-Origin",
        process.env.CLIENT_ORIGIN || "http://localhost:5173",
      );
      reply.header("Access-Control-Allow-Credentials", "true");
    },
  });

  // 6. Auth Plugin
  await server.register(authPlugin);

  // 7. Live Audit Progress WebSocket (/ws/audits/:id)
  server.get<{ Params: { id: string } }>(
    "/ws/audits/:id",
    { websocket: true },
    async (socket, req) => {
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

  // 8. Routes
  await server.register(healthRoutes);
  await server.register(authRoutes, { prefix: "/api/auth" });
  await server.register(documentRoutes, { prefix: "/api/documents" });
  await server.register(approvalRoutes, { prefix: "/api/documents" });
  await server.register(signingRoutes, { prefix: "/api/signing" });

  return server;
}

const start = async () => {
  try {
    await buildServer();
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`Backend running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
