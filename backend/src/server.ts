import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import "dotenv/config";

import authPlugin from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.routes.js";
import { authRoutes } from "./routes/auth.routes.js";
import { documentRoutes } from "./routes/document.routes.js";
import { ServerResponse } from "node:http";

const uploadsDir = path.resolve(process.cwd(), "uploads");

const server = Fastify({ logger: true });

async function buildServer() {
  // 1. CORS
  await server.register(cors, {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  });

  // 2. Multipart Plugin (AWAIT this so content parser is registered before routes)
  await server.register(multipart, {
    limits: {
      fileSize: 20 * 1024 * 1024, // 20 MB
    },
  });

  // 3. Static Files
  // Serve uploaded PDFs with explicit CORS access
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

  // 4. Auth Plugin
  await server.register(authPlugin);

  // 5. Routes
  await server.register(healthRoutes);
  await server.register(authRoutes, { prefix: "/api/auth" });
  await server.register(documentRoutes, { prefix: "/api/documents" });

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
