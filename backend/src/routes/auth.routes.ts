import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";

interface RegisterBody {
  email: string;
  password: string;
  fullName: string;
}

interface LoginBody {
  email: string;
  password: string;
}

export async function authRoutes(
  server: FastifyInstance,
  _opts: FastifyPluginOptions,
) {
  // Register
  server.post(
    "/register",
    async (
      request: FastifyRequest<{ Body: RegisterBody }>,
      reply: FastifyReply,
    ) => {
      const { email, password, fullName } = request.body || {};

      if (!email || !password || !fullName) {
        return reply
          .status(400)
          .send({ error: "Full name, email, and password are required." });
      }

      const existingUser = await pool.query(
        "SELECT id FROM users WHERE email = $1",
        [email],
      );
      if (existingUser.rows.length > 0) {
        return reply
          .status(409)
          .send({ error: "A user with this email already exists." });
      }

      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const result = await pool.query(
        "INSERT INTO users (email, password_hash, full_name) VALUES ($1, $2, $3) RETURNING id, email, full_name, role, created_at",
        [email, passwordHash, fullName],
      );

      return reply.status(201).send({ user: result.rows[0] });
    },
  );

  // Login
  server.post(
    "/login",
    async (
      request: FastifyRequest<{ Body: LoginBody }>,
      reply: FastifyReply,
    ) => {
      const { email, password } = request.body || {};

      if (!email || !password) {
        return reply
          .status(400)
          .send({ error: "Email and password are required." });
      }

      const result = await pool.query("SELECT * FROM users WHERE email = $1", [
        email,
      ]);
      const user = result.rows[0];

      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return reply.status(401).send({ error: "Invalid email or password." });
      }

      const token = server.jwt.sign({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      reply.setCookie("token", token, {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
      });

      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role: user.role,
        },
        token,
      });
    },
  );

  // Get Current Authenticated User
  server.get(
    "/me",
    { preHandler: [server.authenticate] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await pool.query(
        "SELECT id, email, full_name, role, created_at FROM users WHERE id = $1",
        [request.user.id],
      );

      if (result.rows.length === 0) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({ user: result.rows[0] });
    },
  );

  // Logout
  server.post(
    "/logout",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      reply.clearCookie("token", { path: "/" });
      return reply.send({ message: "Logged out successfully" });
    },
  );
}
