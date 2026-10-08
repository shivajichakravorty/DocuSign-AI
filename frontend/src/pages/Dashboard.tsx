import React, { useState, useEffect, useCallback } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { MetricsCard } from "../components/dashboard/MetricsCard";
import { RecentDocuments } from "../components/dashboard/RecentDocuments";
import { UploadModal } from "../components/dashboard/UploadModal";
import { apiClient } from "../api/client";
import type { DocumentItem } from "../types/documents";
import { UploadCloud, Clock, CheckCircle2, ShieldAlert } from "lucide-react";

export const Dashboard: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  // 1. Initial loading is already true, so no need for synchronous setState in effect
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  // 2. Wrap fetchDocuments in useCallback for manual triggers (e.g. after upload modal finishes)
  const fetchDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/documents");
      setDocuments(res.data.documents || []);
    } catch (err) {
      console.error("Failed to fetch documents:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 3. Keep the initial mount fetch isolated and ignore cleanup on unmount
  useEffect(() => {
    let isMounted = true;

    const loadInitialDocuments = async () => {
      try {
        const res = await apiClient.get("/documents");
        if (isMounted) {
          setDocuments(res.data.documents || []);
        }
      } catch (err) {
        console.error("Failed to fetch documents:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadInitialDocuments();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <AppLayout>
      {/* Hero / Quick Action Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-linear-to-r from-indigo-900/40 via-indigo-950/20 to-slate-900/60 border border-indigo-500/20 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Prepare & Send a Document
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Upload your PDF agreement. Our automated AI parser flags indemnity
            risks, liability caps, and highlights required signature tabs.
          </p>
        </div>
        <button
          onClick={() => setIsUploadOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-linear-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 shrink-0"
        >
          <UploadCloud className="w-4 h-4" />
          <span>Upload PDF Document</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricsCard
          title="Total Documents"
          value={documents.length}
          change="All active envelopes"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricsCard
          title="Completed"
          value={documents.filter((d) => d.status === "completed").length}
          change="Fully executed"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricsCard
          title="Flagged"
          value={documents.filter((d) => d.status === "flagged").length}
          change="AI identified risk points"
          icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* Live Documents Table */}
      <RecentDocuments documents={documents} loading={loading} />

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={fetchDocuments}
      />
    </AppLayout>
  );
};
