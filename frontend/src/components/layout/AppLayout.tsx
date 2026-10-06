import React from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { DocumentAtmosphere } from "../common/DocumentAtmosphere";

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-100 overflow-hidden font-sans relative selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background Ambience */}
      <DocumentAtmosphere />

      {/* Sidebar with Glass Styling */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-y-auto px-8 py-6 relative">
          <div className="max-w-6xl mx-auto space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
};
