// src/components/AuditProgressTracker.tsx
import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface ProgressPayload {
  step: string;
  status: string;
  progress: number;
  details?: Record<string, unknown>;
}

interface AuditProgressTrackerProps {
  documentId: string;
  onComplete?: () => void;
  onError?: (error?: string) => void;
}

export const AuditProgressTracker: React.FC<AuditProgressTrackerProps> = ({
  documentId,
  onComplete,
  onError,
}) => {
  const [status, setStatus] = useState<ProgressPayload | null>(null);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  useEffect(() => {
    completedRef.current = false;

    const wsBase =
      import.meta.env.VITE_WS_URL ||
      `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.hostname}:3000`;

    const ws = new WebSocket(`${wsBase}/ws/audits/${documentId}`);

    ws.onmessage = (event) => {
      try {
        const data: ProgressPayload = JSON.parse(event.data);
        setStatus(data);

        const isError =
          data.step === "error" ||
          data.status === "error" ||
          data.status === "failed";

        if (isError && !completedRef.current) {
          completedRef.current = true;
          const errMsg =
            typeof data.details?.error === "string"
              ? data.details.error
              : "Audit scan failed.";
          onErrorRef.current?.(errMsg);
          return;
        }

        const isDone =
          data.status === "completed" ||
          (data.step === "completed" && data.status === "done") ||
          data.progress >= 100;

        if (isDone && !completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      } catch {
        // Ignore malformed WebSocket frames
      }
    };

    ws.onerror = () => {
      // Fallback poller in DocumentWorkspace will still detect completion
    };

    return () => {
      ws.close();
    };
  }, [documentId]);

  if (!status) {
    return (
      <div className="p-3 border border-slate-800 rounded-lg bg-slate-900/90 text-xs text-slate-300 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
        <span>Connecting to audit stream...</span>
      </div>
    );
  }

  const isFailed =
    status.step === "error" ||
    status.status === "error" ||
    status.status === "failed";
  const isFinished =
    !isFailed &&
    (status.status === "completed" ||
      (status.step === "completed" && status.status === "done") ||
      status.progress >= 100);

  return (
    <div className="p-3.5 border border-slate-800 rounded-lg bg-slate-900 text-white space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold capitalize flex items-center gap-1.5">
          {isFailed ? (
            <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
          ) : isFinished ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
          )}
          <span>{status.step.replace(/_/g, " ")}</span>
        </span>
        <span className="font-mono text-slate-300">{status.progress}%</span>
      </div>

      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            isFailed
              ? "bg-rose-500"
              : isFinished
                ? "bg-emerald-500"
                : "bg-indigo-500"
          }`}
          style={{ width: `${Math.min(100, Math.max(0, status.progress))}%` }}
        />
      </div>

      {isFailed && typeof status.details?.error === "string" && (
        <p className="text-[11px] text-rose-400">{status.details.error}</p>
      )}
    </div>
  );
};
