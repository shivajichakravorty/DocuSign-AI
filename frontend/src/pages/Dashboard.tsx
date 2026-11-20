import React, { useState, useEffect, useCallback, useMemo } from "react";
import { AppLayout } from "../components/layout/AppLayout";
import type { DocumentFilter } from "../components/layout/Sidebar";
import { MetricsCard } from "../components/dashboard/MetricsCard";
import { RecentDocuments } from "../components/dashboard/RecentDocuments";
import { UploadModal } from "../components/dashboard/UploadModal";
import { DocumentationModal } from "../components/dashboard/DocumentationModal";
import { SettingsModal } from "../components/dashboard/SettingsModal";
import { apiClient } from "../api/client";
import type { DocumentItem } from "../types/documents";
import {
  UploadCloud,
  Clock,
  CheckCircle2,
  ShieldAlert,
  FilterX,
} from "lucide-react";

const FILTER_LABELS: Record<DocumentFilter, string> = {
  all: "All Documents",
  pending: "Out for Signature",
  completed: "Completed",
  flagged: "AI Audit Risk",
};

export const Dashboard: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isDocsOpen, setIsDocsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Filter & Search State
  const [activeFilter, setActiveFilter] = useState<DocumentFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");

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

    void loadInitialDocuments();

    return () => {
      isMounted = false;
    };
  }, []);

  // Compute live sidebar badge counts
  const counts = useMemo(() => {
    return {
      all: documents.length,
      pending: documents.filter((d) => d.status === "pending").length,
      completed: documents.filter((d) => d.status === "completed").length,
      flagged: documents.filter((d) => d.status === "flagged").length,
    };
  }, [documents]);

  // Apply sidebar category filter + search query
  const filteredDocuments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return documents.filter((doc) => {
      const matchesCategory =
        activeFilter === "all" || doc.status === activeFilter;

      const matchesSearch =
        !query ||
        doc.title.toLowerCase().includes(query) ||
        doc.original_filename.toLowerCase().includes(query) ||
        doc.status.toLowerCase().includes(query);

      return matchesCategory && matchesSearch;
    });
  }, [documents, activeFilter, searchQuery]);

  const hasActiveFilters = activeFilter !== "all" || searchQuery.trim() !== "";

  return (
    <AppLayout
      activeFilter={activeFilter}
      onFilterChange={setActiveFilter}
      counts={counts}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      onOpenDocs={() => setIsDocsOpen(true)}
      onOpenSettings={() => setIsSettingsOpen(true)}
    >
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
          type="button"
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
          value={counts.all}
          change="All active envelopes"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricsCard
          title="Completed"
          value={counts.completed}
          change="Fully executed"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricsCard
          title="Flagged"
          value={counts.flagged}
          change="AI identified risk points"
          icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* Active Filter Pill Bar */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs">
          <div className="flex items-center gap-2 text-slate-300">
            <span>Showing:</span>
            <span className="font-semibold text-indigo-300">
              {FILTER_LABELS[activeFilter]}
            </span>
            {searchQuery.trim() && (
              <span>
                matching{" "}
                <code className="px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300">
                  "{searchQuery.trim()}"
                </code>
              </span>
            )}
            <span className="text-slate-500">
              ({filteredDocuments.length}{" "}
              {filteredDocuments.length === 1 ? "result" : "results"})
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setActiveFilter("all");
              setSearchQuery("");
            }}
            className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Reset filters</span>
          </button>
        </div>
      )}

      {/* Live Documents Table */}
      <RecentDocuments documents={filteredDocuments} loading={loading} />

      {/* Modals */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onUploadSuccess={fetchDocuments}
      />
      <DocumentationModal
        isOpen={isDocsOpen}
        onClose={() => setIsDocsOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </AppLayout>
  );
};
