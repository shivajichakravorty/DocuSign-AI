import React from "react";
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { DocumentItem } from "../../types/documents";

interface RecentDocumentsProps {
  documents: DocumentItem[];
  loading: boolean;
}

export const RecentDocuments: React.FC<RecentDocumentsProps> = ({
  documents,
  loading,
}) => {
  const navigate = useNavigate();

  return (
    <div className="rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight">
            Recent Envelopes
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Track real-time signing progress and audit flags
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-slate-500">
          Loading documents...
        </div>
      ) : documents.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          No documents uploaded yet. Upload your first PDF to get started!
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60">
          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => navigate(`/documents/${doc.id}`)}
              className="py-3.5 flex items-center justify-between group hover:bg-slate-800/30 px-3 -mx-3 rounded-xl transition-colors duration-150 cursor-pointer"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="p-2.5 rounded-xl bg-slate-800/70 border border-slate-700/50 text-indigo-400 shrink-0 group-hover:border-indigo-500/30 transition-colors">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="truncate">
                  <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                    {doc.title}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {doc.original_filename} •{" "}
                    {new Date(doc.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-4 shrink-0">
                {doc.status === "uploaded" && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-xs font-medium">
                    Ready
                  </span>
                )}
                {doc.status === "pending" && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                    <Clock className="w-3 h-3" /> Waiting for signature
                  </span>
                )}
                {doc.status === "completed" && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Signed
                  </span>
                )}
                {doc.status === "flagged" && (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium">
                    <AlertTriangle className="w-3 h-3" /> AI Risk Detected
                  </span>
                )}

                <a
                  href={`http://localhost:3000${doc.file_path}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-400 hover:bg-slate-800 transition"
                  title="View PDF"
                >
                  <ArrowUpRight className="w-4 h-4" />
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
