import React from "react";
import {
  ShieldCheck,
  FileText,
  Send,
  CheckCircle2,
  Sparkles,
  Settings,
  LifeBuoy,
} from "lucide-react";

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, count, active }) => (
  <button
    className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 group ${
      active
        ? "bg-indigo-600/15 text-indigo-400 border border-indigo-500/20 shadow-sm shadow-indigo-500/10"
        : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60"
    }`}
  >
    <div className="flex items-center gap-3">
      <span
        className={`transition-transform duration-200 group-hover:scale-110 ${active ? "text-indigo-400" : "text-slate-400 group-hover:text-slate-200"}`}
      >
        {icon}
      </span>
      <span>{label}</span>
    </div>
    {typeof count === "number" && (
      <span
        className={`text-xs px-2 py-0.5 rounded-full font-semibold transition-colors ${
          active
            ? "bg-indigo-500/20 text-indigo-300"
            : "bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-slate-300"
        }`}
      >
        {count}
      </span>
    )}
  </button>
);

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 border-r border-slate-800/80 bg-slate-950/70 backdrop-blur-2xl flex flex-col justify-between p-4 shrink-0 selection:bg-indigo-500 selection:text-white">
      <div>
        {/* Brand identity */}
        <div className="flex items-center gap-3 px-3 py-3 mb-6">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/25 ring-1 ring-white/20">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
              DocuShield{" "}
              <span className="text-[10px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                AI
              </span>
            </span>
            <p className="text-[11px] text-slate-500 font-medium tracking-tight">
              Smart Secure Signatures
            </p>
          </div>
        </div>

        {/* Navigation Section */}
        <div className="space-y-6">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 px-3.5 mb-2">
              Workspace
            </div>
            <div className="space-y-1">
              <NavItem
                icon={<FileText className="w-4 h-4" />}
                label="All Documents"
                count={12}
                active
              />
              <NavItem
                icon={<Send className="w-4 h-4" />}
                label="Out for Signature"
                count={4}
              />
              <NavItem
                icon={<CheckCircle2 className="w-4 h-4" />}
                label="Completed"
                count={8}
              />
              <NavItem
                icon={<Sparkles className="w-4 h-4" />}
                label="AI Audit Risk"
                count={2}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Support & Settings */}
      <div className="space-y-1 pt-4 border-t border-slate-800/60">
        <NavItem
          icon={<LifeBuoy className="w-4 h-4" />}
          label="Documentation"
        />
        <NavItem icon={<Settings className="w-4 h-4" />} label="Settings" />
      </div>
    </aside>
  );
};
