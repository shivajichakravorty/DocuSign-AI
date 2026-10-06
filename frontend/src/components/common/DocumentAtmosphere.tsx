import React from "react";

export const DocumentAtmosphere: React.FC = () => {
  return (
    <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden">
      {/* 1. Base Image Layer with Blur & Vignette */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat scale-105 filter blur-[2px] opacity-25 brightness-75 contrast-125"
        style={{ backgroundImage: `url('/images/library-bg.jpg')` }}
      />

      {/* 2. Deep Slate / Obsidian Tint Overlay */}
      <div className="absolute inset-0 bg-slate-950/80 mix-blend-multiply" />

      {/* 3. Warm Archival Page Spotlight (Center-Bottom) */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-amber-500/10 rounded-full blur-[140px]" />

      {/* 4. Cool AI / Security Ambient Light (Top-Right) */}
      <div className="absolute top-0 right-1/4 w-[600px] h-[400px] bg-indigo-600/15 rounded-full blur-[130px]" />

      {/* 5. Edge Vignette Shadow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(2,6,23,0.85)_100%)]" />
    </div>
  );
};
