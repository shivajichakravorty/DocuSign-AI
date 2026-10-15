import fs from "node:fs";
import crypto from "node:crypto";

export function computeFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

export function computeSignatureChecksum(
  signerId: string,
  tabValue: string,
  ipAddress: string,
  userAgent: string,
  timestamp: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${signerId}:${tabValue}:${ipAddress}:${userAgent}:${timestamp}`)
    .digest("hex");
}
