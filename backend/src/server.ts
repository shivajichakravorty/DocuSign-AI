import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";

import authPlugin from "./plugins/auth.js";
import { healthRoutes } from "./routes/health.routes.js";
import { authRoutes } from "./routes/auth.routes.js";

const server = Fastify({ logger: true });

// CORS
server.register(cors, {
  origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  credentials: true,
});

// Plugins
server.register(authPlugin);

// Route Groups
server.register(healthRoutes);
server.register(authRoutes, { prefix: "/api/auth" });

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: "0.0.0.0" });
    console.log(`Backend running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
