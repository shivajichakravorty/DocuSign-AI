import React from "react";
import { AppLayout } from "../components/layout/AppLayout";
import { MetricsCard } from "../components/dashboard/MetricsCard";
import { RecentDocuments } from "../components/dashboard/RecentDocuments";
import { UploadCloud, Clock, CheckCircle2, ShieldAlert } from "lucide-react";

export const Dashboard: React.FC = () => {
  return (
    <AppLayout>
      {/* Hero / Quick Action Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-900/40 via-indigo-950/20 to-slate-900/60 border border-indigo-500/20 p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Prepare & Send a Document
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Upload your PDF agreement. Our automated AI parser flags indemnity
            risks, liability caps, and highlights required signature tabs.
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white text-xs font-semibold shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/35 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 shrink-0">
          <UploadCloud className="w-4 h-4" />
          <span>Upload PDF Document</span>
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricsCard
          title="Awaiting Action"
          value="4"
          change="2 require your signature"
          icon={<Clock className="w-4 h-4" />}
        />
        <MetricsCard
          title="Completed"
          value="8"
          change="+3 completed this week"
          icon={<CheckCircle2 className="w-4 h-4" />}
        />
        <MetricsCard
          title="AI Risk Warnings"
          value="2"
          change="Ambiguous indemnity clauses"
          icon={<ShieldAlert className="w-4 h-4 text-amber-400" />}
        />
      </div>

      {/* Recent Documents Table Component */}
      <RecentDocuments />
    </AppLayout>
  );
};
