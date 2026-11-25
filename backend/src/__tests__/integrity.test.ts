import crypto from "node:crypto";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { describe, expect, it } from "vitest";

function computeSha256(buffer: Buffer | string): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

describe("DocuShield Backend Security & Integrity Checks", () => {
  it("computes consistent SHA-256 hashes and detects tampering", () => {
    const originalPdfBytes = Buffer.from("%PDF-1.4 original contract content");
    const tamperedPdfBytes = Buffer.from("%PDF-1.4 modified contract content");

    const originalHash = computeSha256(originalPdfBytes);
    const repeatHash = computeSha256(originalPdfBytes);
    const tamperedHash = computeSha256(tamperedPdfBytes);

    expect(originalHash).toBe(repeatHash);
    expect(originalHash).toHaveLength(64);
    expect(tamperedHash).not.toBe(originalHash);
  });

  it("signs and verifies JWT payloads and rejects invalid tokens", async () => {
    const app = Fastify();
    await app.register(jwt, { secret: "test-secret-key" });

    const payload = {
      id: "user-123",
      email: "test@docushield.ai",
      role: "member",
    };
    const token = app.jwt.sign(payload);
    const decoded = app.jwt.verify<typeof payload>(token);

    expect(decoded.id).toBe("user-123");
    expect(decoded.email).toBe("test@docushield.ai");
    expect(() => app.jwt.verify("invalid.jwt.token")).toThrow();
  });
});
