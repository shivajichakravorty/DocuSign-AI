import React, { useState, useEffect } from "react";
import {
  X,
  Settings,
  User,
  Shield,
  Server,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { apiClient } from "../../api/client";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { user } = useAuth();

  const [defaultShieldView, setDefaultShieldView] = useState<boolean>(() => {
    const saved = localStorage.getItem("docushield_default_shield");
    return saved !== null ? saved === "true" : true;
  });
  const [autoAuditOnUpload, setAutoAuditOnUpload] = useState<boolean>(() => {
    const saved = localStorage.getItem("docushield_auto_audit");
    return saved !== null ? saved === "true" : true;
  });
  const [savedNotice, setSavedNotice] = useState(false);

  const [gatewayStatus, setGatewayStatus] = useState<
    "checking" | "online" | "offline"
  >("checking");

  useEffect(() => {
    if (!isOpen) return;
    let active = true;

    const checkHealth = async () => {
      setGatewayStatus("checking");
      try {
        await apiClient.get("/health");
        if (active) setGatewayStatus("online");
      } catch {
        if (active) setGatewayStatus("offline");
      }
    };

    void checkHealth();
    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSavePreferences = () => {
    localStorage.setItem(
      "docushield_default_shield",
      String(defaultShieldView),
    );
    localStorage.setItem("docushield_auto_audit", String(autoAuditOnUpload));
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Settings className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                Workspace Settings
              </h3>
              <p className="text-[11px] text-slate-400">
                Account details, privacy defaults & system health
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Account Info */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <User className="w-3.5 h-3.5 text-indigo-400" />
              <span>Account Profile</span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-slate-500 text-[11px]">Full Name</p>
                <p className="text-slate-200 font-medium mt-0.5">
                  {user?.fullName || "—"}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-[11px]">Role</p>
                <p className="text-indigo-300 font-medium mt-0.5 capitalize">
                  {user?.role || "Member"}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500 text-[11px]">Email Address</p>
                <p className="text-slate-200 font-medium mt-0.5">
                  {user?.email || "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Privacy & AI Preferences */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span>AI & Privacy Preferences</span>
            </div>

            <label className="flex items-center justify-between gap-3 cursor-pointer">
              <div>
                <p className="text-xs font-medium text-slate-200">
                  Enable PII Shield View by default
                </p>
                <p className="text-[11px] text-slate-500">
                  Highlight detected SSNs, emails, and names upon opening a PDF
                </p>
              </div>
              <input
                type="checkbox"
                checked={defaultShieldView}
                onChange={(e) => setDefaultShieldView(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </label>

            <label className="flex items-center justify-between gap-3 cursor-pointer pt-2 border-t border-slate-800/70">
              <div>
                <p className="text-xs font-medium text-slate-200">
                  Automatic Legal Risk Audit on upload
                </p>
                <p className="text-[11px] text-slate-500">
                  Dispatch new PDFs to the Django AI engine immediately
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoAuditOnUpload}
                onChange={(e) => setAutoAuditOnUpload(e.target.checked)}
                className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
              />
            </label>
          </div>

          {/* Microservice Health */}
          <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
              <Server className="w-3.5 h-3.5 text-indigo-400" />
              <span>Fastify Edge Gateway</span>
            </div>
            {gatewayStatus === "checking" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Checking...
              </span>
            )}
            {gatewayStatus === "online" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Connected
              </span>
            )}
            {gatewayStatus === "offline" && (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-400 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" />
                Unreachable
              </span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-xs text-emerald-400 font-medium">
            {savedNotice ? "Preferences saved!" : ""}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSavePreferences}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
