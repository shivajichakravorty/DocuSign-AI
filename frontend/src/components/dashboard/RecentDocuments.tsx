import React from "react";
import {
  FileText,
  MoreVertical,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";

interface DocumentItem {
  id: string;
  title: string;
  recipient: string;
  status: "pending" | "completed" | "flagged";
  date: string;
}

const sampleDocs: DocumentItem[] = [
  {
    id: "1",
    title: "Enterprise_SaaS_Service_Agreement.pdf",
    recipient: "sarah.j@acme.corp",
    status: "pending",
    date: "2 hours ago",
  },
  {
    id: "2",
    title: "Mutual_Non_Disclosure_Agreement_v3.pdf",
    recipient: "kevin.m@apex.io",
    status: "completed",
    date: "Yesterday",
  },
  {
    id: "3",
    title: "Consulting_Statement_of_Work.pdf",
    recipient: "legal@horizon.tech",
    status: "flagged",
    date: "Oct 04, 2026",
  },
];

export const RecentDocuments: React.FC = () => {
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
        <button className="text-xs font-semibold text-indigo-400 hover:text-indigo-300 transition-colors">
          View all
        </button>
      </div>

      <div className="divide-y divide-slate-800/60">
        {sampleDocs.map((doc) => (
          <div
            key={doc.id}
            className="py-3.5 flex items-center justify-between group hover:bg-slate-800/30 px-3 -mx-3 rounded-xl transition-colors duration-150"
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
                  Sent to {doc.recipient} • {doc.date}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
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

              <button className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors">
                <MoreVertical className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
