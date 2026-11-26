import { Queue } from "bullmq";
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL || "redis://redis:6379/0";

export const redisConnection = new Redis(redisUrl, {
  maxRetriesPerRequest: null,
});

export const auditQueue = new Queue("document-audit-queue", {
  connection: redisConnection,
});
