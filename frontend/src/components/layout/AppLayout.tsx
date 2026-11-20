import React from "react";
import { Sidebar, type DocumentFilter } from "./Sidebar";
import { Topbar } from "./Topbar";
import { DocumentAtmosphere } from "../common/DocumentAtmosphere";

interface AppLayoutProps {
  children: React.ReactNode;
  activeFilter: DocumentFilter;
  onFilterChange: (filter: DocumentFilter) => void;
  counts: {
    all: number;
    pending: number;
    completed: number;
    flagged: number;
  };
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenDocs?: () => void;
  onOpenSettings?: () => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  activeFilter,
  onFilterChange,
  counts,
  searchQuery,
  onSearchChange,
  onOpenDocs,
  onOpenSettings,
}) => {
  return (
    <div className="min-h-screen bg-slate-950/90 text-slate-100 flex overflow-hidden font-sans relative selection:bg-amber-500/30 selection:text-amber-200">
      {/* Atmosphere Background */}
      <DocumentAtmosphere />

      {/* Layout Content sits at z-10 above the atmosphere */}
      <div className="relative z-10 flex w-full h-screen overflow-hidden">
        <Sidebar
          activeFilter={activeFilter}
          onFilterChange={onFilterChange}
          counts={counts}
          onOpenDocs={onOpenDocs}
          onOpenSettings={onOpenSettings}
        />
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <Topbar searchQuery={searchQuery} onSearchChange={onSearchChange} />
          <main className="flex-1 overflow-y-auto px-8 py-6">
            <div className="max-w-6xl mx-auto space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
};
