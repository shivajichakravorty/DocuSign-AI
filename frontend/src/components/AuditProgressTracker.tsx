// src/components/AuditProgressTracker.tsx
import React, { useEffect, useState } from "react";

interface ProgressPayload {
  step: string;
  status: string;
  progress: number;
  details?: Record<string, unknown>;
}

export const AuditProgressTracker: React.FC<{ documentId: string }> = ({
  documentId,
}) => {
  const [status, setStatus] = useState<ProgressPayload | null>(null);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3000/ws/audits/${documentId}`);

    ws.onmessage = (event) => {
      const data: ProgressPayload = JSON.parse(event.data);
      setStatus(data);
    };

    return () => ws.close();
  }, [documentId]);

  if (!status) return <div>Connecting to audit stream...</div>;

  return (
    <div className="p-4 border rounded-lg bg-slate-900 text-white">
      <div className="flex justify-between mb-2">
        <span className="font-semibold capitalize">
          {status.step.replace("_", " ")}
        </span>
        <span>{status.progress}%</span>
      </div>
      <div className="w-full bg-slate-700 h-2 rounded overflow-hidden">
        <div
          className="bg-emerald-500 h-full transition-all duration-300"
          style={{ width: `${status.progress}%` }}
        />
      </div>
    </div>
  );
};
