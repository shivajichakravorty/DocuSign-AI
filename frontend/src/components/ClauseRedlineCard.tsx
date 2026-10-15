import React, { useState } from "react";
import { diffWords } from "diff";

export interface ClauseData {
  id: string;
  category: string;
  risk_level: "High" | "Medium" | "Low";
  original_text: string;
  proposed_remediation: string;
  current_text: string;
  status: "pending" | "accepted" | "rejected" | "customized";
  explanation: string;
}

interface Props {
  clause: ClauseData;
  onUpdateStatus: (
    clauseId: string,
    status: "accepted" | "rejected",
  ) => Promise<void>;
}

export const ClauseRedlineCard: React.FC<Props> = ({
  clause,
  onUpdateStatus,
}) => {
  const [loading, setLoading] = useState(false);

  // Compute inline diff tokens between original and AI proposed remediation
  const diffTokens = diffWords(
    clause.original_text,
    clause.proposed_remediation,
  );

  const handleAction = async (status: "accepted" | "rejected") => {
    setLoading(true);
    try {
      await onUpdateStatus(clause.id, status);
    } finally {
      setLoading(false);
    }
  };

  const riskBadgeColor =
    clause.risk_level === "High"
      ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
      : clause.risk_level === "Medium"
        ? "bg-amber-500/10 text-amber-400 border-amber-500/20"
        : "bg-blue-500/10 text-blue-400 border-blue-500/20";

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <span className="font-semibold text-slate-100">
            {clause.category}
          </span>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full border font-medium ${riskBadgeColor}`}
          >
            {clause.risk_level} Risk
          </span>
        </div>
        <span className="text-xs uppercase tracking-wider font-semibold text-slate-400">
          Status: <span className="text-slate-200">{clause.status}</span>
        </span>
      </div>

      {/* Explanation */}
      <p className="mt-3 text-sm text-slate-300">{clause.explanation}</p>

      {/* Visual Diff View */}
      <div className="mt-4 p-4 rounded-lg bg-slate-950 font-mono text-sm leading-relaxed border border-slate-800">
        {diffTokens.map((part, index) => {
          if (part.added) {
            return (
              <span
                key={index}
                className="bg-emerald-950/80 text-emerald-300 underline decoration-emerald-500 px-1 rounded"
              >
                {part.value}
              </span>
            );
          }
          if (part.removed) {
            return (
              <span
                key={index}
                className="bg-rose-950/80 text-rose-300 line-through decoration-rose-500 px-1 rounded opacity-75"
              >
                {part.value}
              </span>
            );
          }
          return (
            <span key={index} className="text-slate-400">
              {part.value}
            </span>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="mt-4 flex items-center justify-end space-x-3">
        <button
          disabled={loading || clause.status === "rejected"}
          onClick={() => handleAction("rejected")}
          className="px-4 py-1.5 text-xs font-semibold rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors"
        >
          Keep Original
        </button>
        <button
          disabled={loading || clause.status === "accepted"}
          onClick={() => handleAction("accepted")}
          className="px-4 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition-colors"
        >
          Apply Remediation
        </button>
      </div>
    </div>
  );
};
