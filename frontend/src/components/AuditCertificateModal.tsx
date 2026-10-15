import React, { useEffect, useState } from "react";
import { apiClient } from "../api/client";
import {
  ShieldCheck,
  ShieldAlert,
  CheckCircle,
  Copy,
  X,
  Loader2,
  Fingerprint,
} from "lucide-react";

interface VerificationData {
  documentId: string;
  title: string;
  preSignHash: string;
  postSignHash: string;
  currentDiskHash: string;
  isTampered: boolean;
  sealedAt: string | null;
  certificate: {
    certificate_number: string;
    issued_at: string;
  } | null;
  auditTrail: Array<{
    id: string;
    full_name: string;
    email: string;
    ip_address: string;
    user_agent: string;
    signature_checksum: string;
    timestamp: string;
  }>;
}

export const AuditCertificateModal: React.FC<{
  documentId: string;
  onClose: () => void;
}> = ({ documentId, onClose }) => {
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadVerification() {
      try {
        const res = await apiClient.get(`/verify/${documentId}`);
        if (isMounted) setData(res.data);
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadVerification();
    return () => {
      isMounted = false;
    };
  }, [documentId]);

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 flex items-center gap-3 text-slate-400">
          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
          <span>Verifying cryptographic seal...</span>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-bold text-white">
              Cryptographic Certificate of Completion
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Integrity Seal Badge */}
          <div
            className={`p-4 rounded-xl border flex items-center gap-3.5 ${
              data.isTampered
                ? "bg-rose-950/30 border-rose-500/40 text-rose-300"
                : "bg-emerald-950/30 border-emerald-500/40 text-emerald-300"
            }`}
          >
            {data.isTampered ? (
              <ShieldAlert className="w-8 h-8 text-rose-400 shrink-0" />
            ) : (
              <ShieldCheck className="w-8 h-8 text-emerald-400 shrink-0" />
            )}
            <div>
              <p className="font-bold text-sm">
                {data.isTampered
                  ? "Tamper Alert: Hash Mismatch"
                  : "Cryptographically Verified & Intact"}
              </p>
              <p className="text-xs opacity-90 mt-0.5">
                {data.isTampered
                  ? "The file on disk differs from the SHA-256 digest sealed at signing time."
                  : "All signatures, timestamps, and IP addresses match the immutable certificate ledger."}
              </p>
            </div>
          </div>

          {/* SHA-256 Fingerprints */}
          <div className="space-y-3 bg-slate-950/70 p-4 rounded-xl border border-slate-800 font-mono text-xs">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-500">
                Pre-Sign Hash (Original)
              </span>
              <div className="flex items-center justify-between mt-1 text-slate-300">
                <span className="truncate max-w-md">
                  {data.preSignHash || "Not recorded yet"}
                </span>
                {data.preSignHash && (
                  <button
                    onClick={() => copyText(data.preSignHash)}
                    className="text-indigo-400 hover:text-white"
                  >
                    {copiedHash === data.preSignHash ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[10px] uppercase font-bold text-slate-500">
                Post-Sign Hash (Sealed Digest)
              </span>
              <div className="flex items-center justify-between mt-1 text-slate-300">
                <span className="truncate max-w-md">
                  {data.postSignHash || "Awaiting final signatures"}
                </span>
                {data.postSignHash && (
                  <button
                    onClick={() => copyText(data.postSignHash)}
                    className="text-indigo-400 hover:text-white"
                  >
                    {copiedHash === data.postSignHash ? (
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Signer Telemetry Ledger */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Signer Telemetry Ledger
            </h3>
            <div className="space-y-2">
              {data.auditTrail.map((log) => (
                <div
                  key={log.id}
                  className="p-3 bg-slate-950/50 border border-slate-800 rounded-xl text-xs space-y-1"
                >
                  <div className="flex justify-between font-semibold text-slate-200">
                    <span>
                      {log.full_name} ({log.email})
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      {log.ip_address}
                    </span>
                  </div>
                  <p className="font-mono text-[10px] text-indigo-400 truncate">
                    Checksum: {log.signature_checksum}
                  </p>
                  <p className="text-[10px] text-slate-500">
                    Signed at: {new Date(log.timestamp).toUTCString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
