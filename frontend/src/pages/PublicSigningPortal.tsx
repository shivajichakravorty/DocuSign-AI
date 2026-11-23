import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Document, Page } from "react-pdf";
import "../utils/pdfWorker";
import axios from "axios";
import {
  ShieldCheck,
  PenTool,
  Calendar,
  UserCheck,
  Type,
  CheckCircle2,
  Loader2,
  AlertCircle,
  X,
} from "lucide-react";
import type { SignatureTab } from "../types/tabs";

interface SignerData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  signed_at?: string | null;
}

interface DocumentData {
  id: string;
  title: string;
  file_path: string;
  status: string;
}

function getInitials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("")
    .slice(0, 3);
}

export const PublicSigningPortal: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [signer, setSigner] = useState<SignerData | null>(null);
  const [tabs, setTabs] = useState<SignatureTab[]>([]);
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

  const [editingTextTabIdx, setEditingTextTabIdx] = useState<number | null>(
    null,
  );
  const [textInputValue, setTextInputValue] = useState("");

  useEffect(() => {
    let isMounted = true;

    const fetchPortalData = async () => {
      try {
        setLoading(true);
        const res = await axios.get(
          `http://localhost:3000/api/documents/sign/${token}`,
        );
        if (isMounted) {
          setDocumentData(res.data.document);
          setSigner(res.data.signer);
          setTabs(res.data.tabs || []);
          if (
            res.data.signer?.status === "signed" ||
            res.data.signer?.status === "completed"
          ) {
            setCompleted(true);
          }
        }
      } catch (err: unknown) {
        if (isMounted) {
          const resp = (
            err as {
              response?: { data?: { message?: string; error?: string } };
            }
          )?.response?.data;
          setError(
            resp?.message ||
              resp?.error ||
              "This signing link is invalid, expired, or already completed.",
          );
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (token) {
      void fetchPortalData();
    }

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSignTab = (tabIdx: number) => {
    if (!signer) return;
    const targetTab = tabs[tabIdx];
    if (!targetTab) return;

    if (targetTab.tab_type === "text") {
      setEditingTextTabIdx(tabIdx);
      setTextInputValue(targetTab.value || "");
      return;
    }

    let stampedValue = signer.full_name;
    if (targetTab.tab_type === "initials") {
      stampedValue = getInitials(signer.full_name);
    } else if (targetTab.tab_type === "date") {
      stampedValue = new Date().toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }

    setTabs((prev) =>
      prev.map((tab, idx) =>
        idx === tabIdx ? { ...tab, value: stampedValue } : tab,
      ),
    );
    setSubmitError(null);
  };

  const handleSaveTextTab = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingTextTabIdx === null) return;
    const trimmed = textInputValue.trim();
    if (!trimmed) return;

    setTabs((prev) =>
      prev.map((tab, idx) =>
        idx === editingTextTabIdx ? { ...tab, value: trimmed } : tab,
      ),
    );
    setEditingTextTabIdx(null);
    setTextInputValue("");
    setSubmitError(null);
  };

  const missingRequiredCount = tabs.filter(
    (t) => t.is_required !== false && !t.value?.trim(),
  ).length;

  const handleFinishSigning = async () => {
    if (!token || submitting) return;

    if (missingRequiredCount > 0) {
      setSubmitError(
        `Please complete ${missingRequiredCount} remaining required field(s) before submitting.`,
      );
      return;
    }

    const tabValues = tabs
      .filter((t) => t.id && t.value)
      .map((t) => ({ tabId: t.id!, value: t.value! }));

    if (tabValues.length === 0) {
      setSubmitError("No signature fields found on this document to submit.");
      return;
    }

    try {
      setSubmitting(true);
      setSubmitError(null);

      await axios.post(
        `http://localhost:3000/api/signing/sign/${token}/submit`,
        { tabValues },
      );

      setCompleted(true);
    } catch (err: unknown) {
      const resp = (
        err as { response?: { data?: { message?: string; error?: string } } }
      )?.response?.data;
      setSubmitError(
        resp?.message ||
          resp?.error ||
          "Failed to submit cryptographic signature.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm">Preparing secure signing room...</p>
      </div>
    );
  }

  if (error || !documentData || !signer) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-white mb-1">Access Restricted</h2>
        <p className="text-sm text-slate-400">
          {error || "Unable to open signing portal."}
        </p>
      </div>
    );
  }

  if (completed) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-3" />
        <h2 className="text-xl font-bold text-white mb-1">
          Document Signed Successfully
        </h2>
        <p className="text-sm text-slate-400 max-w-sm">
          Thank you, {signer.full_name}. Your cryptographic signature has been
          recorded and sealed into the audit trail.
        </p>
      </div>
    );
  }

  const pdfUrl = `http://localhost:3000${documentData.file_path}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      <header className="h-16 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-2 text-indigo-400 font-bold text-base">
          <ShieldCheck className="w-6 h-6" />
          <span>DocuShield Secure Sign</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-400">
            Signer: <strong className="text-white">{signer.full_name}</strong> (
            {signer.email})
          </span>
          <button
            onClick={handleFinishSigning}
            disabled={submitting || missingRequiredCount > 0}
            title={
              missingRequiredCount > 0
                ? `Complete ${missingRequiredCount} required field(s) first`
                : "Submit signature"
            }
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 disabled:shadow-none transition cursor-pointer disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>
              {submitting
                ? "Sealing..."
                : missingRequiredCount > 0
                  ? `${missingRequiredCount} Field${missingRequiredCount === 1 ? "" : "s"} Left`
                  : "Complete Signing"}
            </span>
          </button>
        </div>
      </header>

      {submitError && (
        <div className="bg-rose-950/90 border-b border-rose-500/40 px-6 py-2.5 flex items-center justify-between text-xs text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{submitError}</span>
          </div>
          <button
            onClick={() => setSubmitError(null)}
            className="text-rose-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
        <Document
          file={{ url: pdfUrl }}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={
            <div className="flex items-center gap-2 text-slate-400 py-12">
              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              <span>Loading agreement...</span>
            </div>
          }
        >
          {Array.from(new Array(numPages), (_, index) => {
            const pageNumber = index + 1;
            const pageTabs = tabs.filter((t) => t.page_number === pageNumber);

            return (
              <div
                key={`sign_page_${pageNumber}`}
                className="relative mb-6 shadow-2xl rounded-sm overflow-hidden border border-slate-800"
              >
                <Page
                  pageNumber={pageNumber}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />

                {pageTabs.map((tab, idx) => {
                  const originalIdx = tabs.indexOf(tab);

                  return (
                    <button
                      key={tab.id || `tab_sign_${idx}`}
                      onClick={() => handleSignTab(originalIdx)}
                      style={{ left: `${tab.pos_x}%`, top: `${tab.pos_y}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        tab.value
                          ? tab.tab_type === "signature" ||
                            tab.tab_type === "initials"
                            ? "bg-emerald-950/90 border-emerald-500 text-emerald-300 font-serif italic"
                            : "bg-emerald-950/90 border-emerald-500 text-emerald-300"
                          : "bg-indigo-600/90 hover:bg-indigo-500 border-indigo-400 text-white animate-pulse"
                      }`}
                    >
                      {tab.value ? (
                        tab.value
                      ) : (
                        <span className="flex items-center gap-1.5">
                          {tab.tab_type === "date" ? (
                            <Calendar className="w-3.5 h-3.5" />
                          ) : tab.tab_type === "initials" ? (
                            <UserCheck className="w-3.5 h-3.5" />
                          ) : tab.tab_type === "text" ? (
                            <Type className="w-3.5 h-3.5" />
                          ) : (
                            <PenTool className="w-3.5 h-3.5" />
                          )}
                          <span>Click to {tab.tab_type}</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </Document>
      </main>

      {/* Text Field Input Modal */}
      {editingTextTabIdx !== null && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveTextTab}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Enter Field Text</h3>
              <button
                type="button"
                onClick={() => setEditingTextTabIdx(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              autoFocus
              required
              placeholder="e.g., Title, Company, or Note"
              value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-indigo-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingTextTabIdx(null)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold"
              >
                Apply
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
