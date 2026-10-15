import React, { useEffect, useState, useMemo } from "react";
import { ClauseRedlineCard } from "./ClauseRedlineCard";
import type { ClauseData } from "./ClauseRedlineCard";

interface Props {
  documentId: string;
  token?: string;
  apiBaseUrl?: string;
}

export const ClauseRedlineManager: React.FC<Props> = ({
  documentId,
  token,
  apiBaseUrl = "http://localhost:3000/api",
}) => {
  const [clauses, setClauses] = useState<ClauseData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<
    "ALL" | "PENDING" | "ACCEPTED" | "REJECTED"
  >("ALL");
  const [reloadKey, setReloadKey] = useState(0);

  const headers = useMemo(() => {
    const defaultHeaders: Record<string, string> = {
      "Content-Type": "application/json",
    };
    const activeToken = token || localStorage.getItem("token");
    if (activeToken) {
      defaultHeaders["Authorization"] = `Bearer ${activeToken}`;
    }
    return defaultHeaders;
  }, [token]);

  useEffect(() => {
    let isSubscribed = true;

    async function fetchClauses() {
      try {
        setError(null);
        const res = await fetch(
          `${apiBaseUrl}/documents/${documentId}/clauses`,
          {
            headers,
          },
        );

        if (!res.ok) {
          throw new Error(`Failed to load clauses (${res.statusText})`);
        }

        const data = await res.json();
        if (isSubscribed) {
          setClauses(data.clauses || []);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isSubscribed) {
          setError(
            err instanceof Error ? err.message : "An unexpected error occurred",
          );
          setLoading(false);
        }
      }
    }

    void fetchClauses();

    return () => {
      isSubscribed = false;
    };
  }, [apiBaseUrl, documentId, headers, reloadKey]);

  const reload = () => {
    setLoading(true);
    setReloadKey((prev) => prev + 1);
  };

  const handleUpdateStatus = async (
    clauseId: string,
    status: "accepted" | "rejected",
  ) => {
    try {
      const res = await fetch(
        `${apiBaseUrl}/documents/${documentId}/clauses/${clauseId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ status }),
        },
      );

      if (!res.ok) {
        throw new Error("Failed to update clause state");
      }

      const { clause: updatedClause } = await res.json();

      setClauses((prev) =>
        prev.map((c) => (c.id === clauseId ? { ...c, ...updatedClause } : c)),
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Error updating clause");
    }
  };

  const handleApplyAllPending = async () => {
    const pendingClauses = clauses.filter((c) => c.status === "pending");
    if (!pendingClauses.length) return;

    for (const c of pendingClauses) {
      await handleUpdateStatus(c.id, "accepted");
    }
  };

  const stats = useMemo(() => {
    const total = clauses.length;
    const accepted = clauses.filter((c) => c.status === "accepted").length;
    const pending = clauses.filter((c) => c.status === "pending").length;
    const highRisk = clauses.filter((c) => c.risk_level === "High").length;
    return { total, accepted, pending, highRisk };
  }, [clauses]);

  const filteredClauses = useMemo(() => {
    if (filter === "ALL") return clauses;
    return clauses.filter((c) => c.status.toUpperCase() === filter);
  }, [clauses, filter]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50">
        <div className="flex items-center space-x-3 text-slate-400">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <span className="text-sm font-medium">
            Loading clause risks & remediations...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-rose-900/50 bg-rose-950/20 p-5 text-rose-300">
        <p className="font-semibold">Unable to load clauses</p>
        <p className="text-sm opacity-80 mt-1">{error}</p>
        <button
          onClick={reload}
          className="mt-3 text-xs bg-rose-900/60 hover:bg-rose-800 text-white px-3 py-1.5 rounded transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (clauses.length === 0) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-8 text-center text-slate-400">
        <p className="text-base font-semibold text-slate-200">
          No Risk Flags Detected
        </p>
        <p className="text-sm mt-1">
          This agreement cleared standard liability and indemnification risk
          thresholds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-xl border border-slate-800 bg-slate-900/70 backdrop-blur">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            AI Clause Redlining & Remediation
            {stats.highRisk > 0 && (
              <span className="text-xs bg-rose-500/20 border border-rose-500/30 text-rose-400 font-semibold px-2.5 py-0.5 rounded-full">
                {stats.highRisk} High Risk
              </span>
            )}
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            {stats.pending} pending decisions · {stats.accepted} of{" "}
            {stats.total} remediations applied
          </p>
        </div>

        <div className="flex items-center gap-3">
          {stats.pending > 0 && (
            <button
              onClick={handleApplyAllPending}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition"
            >
              Apply All Remediations
            </button>
          )}
        </div>
      </div>

      <div className="flex space-x-2 border-b border-slate-800 pb-2">
        {(["ALL", "PENDING", "ACCEPTED", "REJECTED"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
              filter === tab
                ? "bg-slate-800 text-slate-100"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredClauses.map((clause) => (
          <ClauseRedlineCard
            key={clause.id}
            clause={clause}
            onUpdateStatus={handleUpdateStatus}
          />
        ))}
      </div>
    </div>
  );
};
