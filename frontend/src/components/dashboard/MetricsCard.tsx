import React from "react";

interface MetricsCardProps {
  title: string;
  value: string | number;
  change: string;
  icon: React.ReactNode;
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
  title,
  value,
  change,
  icon,
}) => {
  return (
    <div className="group relative rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-slate-800/80 p-5 hover:border-slate-700/80 transition-all duration-300 shadow-sm hover:shadow-indigo-500/5 hover:-translate-y-0.5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
          {title}
        </span>
        <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 text-indigo-400 group-hover:scale-110 group-hover:text-indigo-300 group-hover:bg-indigo-500/10 transition-all duration-300">
          {icon}
        </div>
      </div>
      <div className="text-2xl font-bold text-white tracking-tight">
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1 font-medium">{change}</div>
    </div>
  );
};
