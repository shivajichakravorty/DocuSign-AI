import websocketPlugin from "@fastify/websocket";
import { FastifyPluginAsync } from "fastify";
import { redisConnection } from "../queues/audit.queue.js";

export const wsRoutes: FastifyPluginAsync = async (fastify) => {
  // Only register websocketPlugin if not already registered globally in server.ts
  if (!fastify.hasPlugin("@fastify/websocket")) {
    await fastify.register(websocketPlugin);
  }

  fastify.get(
    "/ws/audits/:documentId",
    { websocket: true },
    async (connection, req) => {
      const { documentId } = req.params as { documentId: string };

      // Duplicate the shared ioredis connection for a dedicated subscriber
      const subRedis = redisConnection.duplicate();

      try {
        await subRedis.subscribe(`audit-progress:${documentId}`);

        subRedis.on("message", (_channel, message) => {
          connection.socket.send(message);
        });

        connection.socket.on("close", async () => {
          await subRedis.unsubscribe(`audit-progress:${documentId}`);
          subRedis.quit();
        });
      } catch (err) {
        fastify.log.error(err);
        connection.socket.close(
          1011,
          "Failed to connect to audit event stream",
        );
        subRedis.quit();
      }
    },
  );
};
