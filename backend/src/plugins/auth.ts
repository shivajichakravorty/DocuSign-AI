import {
  FastifyInstance,
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";
import jwt from "@fastify/jwt";
import cookie from "@fastify/cookie";

// Type augmentations for Fastify and JWT
declare module "fastify" {
  interface FastifyInstance {
    authenticate: (
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>;
  }
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { id: string; email: string; role: string };
    user: { id: string; email: string; role: string };
  }
}

const authPluginAsync: FastifyPluginAsync = async (server: FastifyInstance) => {
  await server.register(cookie);

  await server.register(jwt, {
    secret:
      process.env.JWT_SECRET || "fallback-secret-key-change-in-production",
    cookie: {
      cookieName: "token",
      signed: false,
    },
  });

  server.decorate(
    "authenticate",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        await request.jwtVerify();
      } catch (err) {
        reply
          .status(401)
          .send({ error: "Unauthorized: Missing or invalid token" });
      }
    },
  );
};

export default fp(authPluginAsync);
