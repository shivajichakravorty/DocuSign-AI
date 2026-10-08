import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Document, Page } from "react-pdf";
import "../utils/pdfWorker";
import axios from "axios";
import {
  ShieldCheck,
  PenTool,
  Calendar,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from "lucide-react";
import type { SignatureTab } from "../types/tabs";

interface SignerData {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
}

interface DocumentData {
  id: string;
  title: string;
  file_path: string;
  status: string;
}

export const PublicSigningPortal: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  const [documentData, setDocumentData] = useState<DocumentData | null>(null);
  const [signer, setSigner] = useState<SignerData | null>(null);
  const [tabs, setTabs] = useState<SignatureTab[]>([]);
  const [numPages, setNumPages] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);

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
        }
      } catch {
        if (isMounted) {
          setError(
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
      fetchPortalData();
    }

    return () => {
      isMounted = false;
    };
  }, [token]);

  const handleSignTab = (tabIdx: number) => {
    if (!signer) return;

    setTabs((prev) =>
      prev.map((tab, idx) =>
        idx === tabIdx
          ? {
              ...tab,
              value:
                tab.tab_type === "date"
                  ? new Date().toLocaleDateString()
                  : signer.full_name,
            }
          : tab,
      ),
    );
  };

  const handleFinishSigning = () => {
    setCompleted(true);
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
          Thank you, {signer.full_name}. All parties will receive a final
          audit-certified copy once complete.
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
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            Complete Signing
          </button>
        </div>
      </header>

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
                      key={`tab_sign_${idx}`}
                      onClick={() => handleSignTab(originalIdx)}
                      style={{ left: `${tab.pos_x}%`, top: `${tab.pos_y}%` }}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                        tab.value
                          ? "bg-emerald-950/90 border-emerald-500 text-emerald-300 font-serif italic"
                          : "bg-indigo-600/90 hover:bg-indigo-500 border-indigo-400 text-white animate-pulse"
                      }`}
                    >
                      {tab.value ? (
                        tab.value
                      ) : (
                        <span className="flex items-center gap-1.5">
                          {tab.tab_type === "date" ? (
                            <Calendar className="w-3.5 h-3.5" />
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
    </div>
  );
};
