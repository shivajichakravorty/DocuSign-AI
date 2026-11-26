import { Queue } from "bullmq";
import { redisConnection } from "./audit.queue.js";

export const auditQueue = new Queue("document-audit-queue", {
  connection: redisConnection,
});
