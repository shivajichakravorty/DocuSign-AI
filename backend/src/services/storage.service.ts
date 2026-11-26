import fs from "fs";
import path from "path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const driver = process.env.STORAGE_DRIVER === "s3" ? "s3" : "local";
const bucket = process.env.S3_BUCKET || "docushield-pdfs";

const s3Client =
  driver === "s3"
    ? new S3Client({
        region: process.env.AWS_REGION || "us-east-1",
        ...(process.env.S3_ENDPOINT
          ? { endpoint: process.env.S3_ENDPOINT }
          : {}),
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "",
        },
      })
    : null;

export async function uploadPdfBuffer(
  key: string,
  buffer: Buffer,
  contentType = "application/pdf",
): Promise<{ storageKey: string; publicPath: string }> {
  if (driver === "s3" && s3Client) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    return { storageKey: key, publicPath: `s3://${bucket}/${key}` };
  }

  const localDir = path.resolve(process.cwd(), "uploads");
  await fs.promises.mkdir(localDir, { recursive: true });
  const safeName = path.basename(key);
  const fullPath = path.join(localDir, safeName);
  await fs.promises.writeFile(fullPath, buffer);
  return { storageKey: safeName, publicPath: `/uploads/${safeName}` };
}

export async function getPdfBuffer(filePathOrKey: string): Promise<Buffer> {
  if (driver === "s3" && s3Client) {
    const key = filePathOrKey.startsWith(`s3://${bucket}/`)
      ? filePathOrKey.replace(`s3://${bucket}/`, "")
      : filePathOrKey.replace(/^\/?uploads\//, "");

    const res = await s3Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error("Empty S3 object stream");
    return Buffer.from(bytes);
  }

  const resolved = path.resolve(
    process.cwd(),
    filePathOrKey.startsWith("/") ? `.${filePathOrKey}` : filePathOrKey,
  );
  return fs.promises.readFile(resolved);
}

export async function getPresignedPdfUrl(
  filePathOrKey: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  if (driver !== "s3" || !s3Client) return null;

  const key = filePathOrKey.startsWith(`s3://${bucket}/`)
    ? filePathOrKey.replace(`s3://${bucket}/`, "")
    : filePathOrKey.replace(/^\/?uploads\//, "");

  return getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

export async function deleteStoredPdf(filePathOrKey: string): Promise<void> {
  if (driver === "s3" && s3Client) {
    const key = filePathOrKey.startsWith(`s3://${bucket}/`)
      ? filePathOrKey.replace(`s3://${bucket}/`, "")
      : filePathOrKey.replace(/^\/?uploads\//, "");

    await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    return;
  }

  const resolved = path.resolve(
    process.cwd(),
    filePathOrKey.startsWith("/") ? `.${filePathOrKey}` : filePathOrKey,
  );
  if (fs.existsSync(resolved)) {
    await fs.promises.unlink(resolved);
  }
}
