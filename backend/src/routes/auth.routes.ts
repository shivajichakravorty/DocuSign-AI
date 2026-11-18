import {
  FastifyInstance,
  FastifyPluginOptions,
  FastifyRequest,
  FastifyReply,
} from "fastify";
import bcrypt from "bcryptjs";
import { pool } from "../db.js";
import crypto from "node:crypto";

interface RegisterBody {
  email: string;
  password: string;
  fullName: string;
}

interface LoginBody {
  email: string;
  password: string;
}

interface ForgotPasswordBody {
  email: string;
}

interface ResetPasswordBody {
  token: string;
  newPassword: string;
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

  // Forgot Password
  server.post(
    "/forgot-password",
    async (
      request: FastifyRequest<{ Body: ForgotPasswordBody }>,
      reply: FastifyReply,
    ) => {
      const { email } = request.body || {};

      if (!email) {
        return reply.status(400).send({ error: "Email is required." });
      }

      const normalizedEmail = email.trim().toLowerCase();
      const userResult = await pool.query(
        "SELECT id, email FROM users WHERE LOWER(email) = $1",
        [normalizedEmail],
      );
      const user = userResult.rows[0];

      // Always return a generic 200 response to prevent email enumeration
      if (user) {
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto
          .createHash("sha256")
          .update(rawToken)
          .digest("hex");
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

        // Invalidate any previous unused tokens for this user
        await pool.query(
          "UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL",
          [user.id],
        );

        await pool.query(
          "INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
          [user.id, tokenHash, expiresAt],
        );

        const clientOrigin =
          process.env.CLIENT_ORIGIN || "http://localhost:5173";
        const resetLink = `${clientOrigin}/reset-password?token=${rawToken}`;

        // Log link to server console for local development testing
        server.log.info(`Password reset link for ${user.email}: ${resetLink}`);
      }

      return reply.send({
        message:
          "If an account with that email exists, a password reset link has been generated.",
      });
    },
  );

  // Reset Password
  server.post(
    "/reset-password",
    async (
      request: FastifyRequest<{ Body: ResetPasswordBody }>,
      reply: FastifyReply,
    ) => {
      const { token, newPassword } = request.body || {};

      if (!token || !newPassword) {
        return reply
          .status(400)
          .send({ error: "Reset token and new password are required." });
      }

      if (newPassword.length < 8) {
        return reply
          .status(400)
          .send({ error: "Password must be at least 8 characters long." });
      }

      const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        const tokenRes = await client.query(
          `SELECT id, user_id, expires_at, used_at 
           FROM password_reset_tokens 
           WHERE token_hash = $1 
           FOR UPDATE`,
          [tokenHash],
        );

        const resetRecord = tokenRes.rows[0];

        if (
          !resetRecord ||
          resetRecord.used_at !== null ||
          new Date(resetRecord.expires_at) < new Date()
        ) {
          await client.query("ROLLBACK");
          return reply
            .status(400)
            .send({ error: "Invalid or expired password reset token." });
        }

        const passwordHash = await bcrypt.hash(newPassword, 10);

        await client.query(
          "UPDATE users SET password_hash = $1 WHERE id = $2",
          [passwordHash, resetRecord.user_id],
        );

        await client.query(
          "UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1",
          [resetRecord.id],
        );

        await client.query("COMMIT");

        return reply.send({
          message: "Password has been reset successfully. You can now log in.",
        });
      } catch (err) {
        await client.query("ROLLBACK");
        server.log.error(err);
        return reply.status(500).send({ error: "Failed to reset password." });
      } finally {
        client.release();
      }
    },
  );
}
