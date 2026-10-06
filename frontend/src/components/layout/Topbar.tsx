import React from "react";
import { Search, Bell, LogOut, Sparkles } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

export const Topbar: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <header className="h-16 border-b border-slate-800/80 bg-slate-950/40 backdrop-blur-xl px-6 flex items-center justify-between z-10 shrink-0">
      {/* Search Input with shortcut pill */}
      <div className="relative w-80">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          placeholder="Search contracts, clauses, signers..."
          className="w-full bg-slate-900/60 border border-slate-800/80 rounded-xl pl-10 pr-12 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/60 focus:ring-1 focus:ring-indigo-500/30 transition-all duration-200"
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-400">
          ⌘K
        </div>
      </div>

      {/* User Actions & Profile */}
      <div className="flex items-center gap-3">
        {/* AI Quota Pill */}
        <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-medium">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>AI Engine Ready</span>
        </div>

        {/* Notifications */}
        <button className="relative p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 border border-transparent hover:border-slate-800 transition-colors">
          <Bell className="w-4 h-4" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 ring-4 ring-slate-950" />
        </button>

        {/* Profile Pill */}
        <div className="flex items-center gap-3 pl-3 border-l border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold uppercase shadow-sm">
              {user?.fullName?.charAt(0) || "U"}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold text-slate-200 leading-tight">
                {user?.fullName}
              </p>
              <p className="text-[11px] text-slate-500 leading-tight capitalize">
                {user?.role || "Member"}
              </p>
            </div>
          </div>

          <button
            onClick={() => logout()}
            title="Log out"
            className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all duration-200 ml-1"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
