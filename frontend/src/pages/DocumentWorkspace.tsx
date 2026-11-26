import React, { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Document, Page } from "react-pdf";
import "../utils/pdfWorker";
import { apiClient } from "../api/client";
import type { DocumentItem as BaseDocumentItem } from "../types/documents";
import type { SignatureTab, TabType } from "../types/tabs";
import { AuditProgressTracker } from "../components/AuditProgressTracker";
import { ClauseRedlineManager } from "../components/ClauseRedlineManager";
import { AuditCertificateModal } from "../components/AuditCertificateModal";

import {
  ArrowLeft,
  ZoomIn,
  ZoomOut,
  PenTool,
  Calendar,
  UserCheck,
  Type,
  ShieldAlert,
  ShieldCheck,
  Save,
  Loader2,
  AlertCircle,
  X,
  UserPlus,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Sparkles,
  GitPullRequest,
  Users,
  CheckCircle2,
  XCircle,
  Lock,
  Fingerprint,
  Download,
  MessageSquare,
  Send,
  FileText,
} from "lucide-react";

interface DocumentItem extends BaseDocumentItem {
  audit_status?:
    | "idle"
    | "queued"
    | "processing"
    | "completed"
    | "failed"
    | string;
  audit_job_id?: string | null;
  risk_score?: number | null;
  approval_status?: "draft" | "pending_legal" | "approved" | "rejected";
}

interface Signer {
  id: string;
  email: string;
  full_name: string;
  role: string;
  status: string;
  token?: string;
}

interface RedactionEntity {
  id: string;
  entity_type: string;
  entity_text: string;
  confidence: number;
  page_number: number;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  is_masked: boolean;
}

interface AuditData {
  compliance_score: number;
  risk_level: string;
  flags_count: number;
  flags_data: Array<{
    id: string;
    category: string;
    severity: string;
    title: string;
    description: string;
    snippet: string | null;
  }>;
}

interface ChatCitation {
  chunk_id: string;
  page_number: number;
  similarity: number;
  snippet: string;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: ChatCitation[];
}

export const DocumentWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Document & Signers State
  const [documentData, setDocumentData] = useState<DocumentItem | null>(null);
  const [signers, setSigners] = useState<Signer[]>([]);
  const [tabs, setTabs] = useState<SignatureTab[]>([]);
  const [selectedTool, setSelectedTool] = useState<TabType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [reloadTrigger, setReloadTrigger] = useState(0);

  // Privacy-Preserving RAG Chat State
  const [isChatIndexed, setIsChatIndexed] = useState(false);
  const [indexedChunksCount, setIndexedChunksCount] = useState(0);
  const [isIndexingChat, setIsIndexingChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingChat, setIsSendingChat] = useState(false);
  const [highlightedPage, setHighlightedPage] = useState<number | null>(null);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Export State
  const [exportingType, setExportingType] = useState<
    "redacted" | "signed" | null
  >(null);

  // Legal Triage State
  const [triageLoading, setTriageLoading] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);

  // Right Drawer Tab State ('audit' | 'signers' | 'chat')
  const [activeRightTab, setActiveRightTab] = useState<
    "audit" | "signers" | "chat"
  >("audit");
  const [showRedlineModal, setShowRedlineModal] = useState(false);
  const [showCertificateModal, setShowCertificateModal] = useState(false);

  // AI Audit & Redaction State
  const [auditData, setAuditData] = useState<AuditData | null>(null);
  const [redactions, setRedactions] = useState<RedactionEntity[]>([]);
  const [showRedactions, setShowRedactions] = useState(true);
  const [auditing, setAuditing] = useState(false);

  // Recipient Addition State
  const [recipientEmail, setRecipientEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [addingRecipient, setAddingRecipient] = useState(false);
  const [showAddRecipient, setShowAddRecipient] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // PDF Viewer State
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);

  // Dragging Existing Placed Tabs State
  const [draggingTabIdx, setDraggingTabIdx] = useState<number | null>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspaceData() {
      if (!id) return;
      try {
        setError(null);
        const [docRes, tabsRes, auditRes, chatStatusRes] = await Promise.all([
          apiClient.get(`/documents/${id}`),
          apiClient.get(`/documents/${id}/tabs`),
          apiClient.get(`/documents/${id}/audit`),
          apiClient
            .get(`/documents/${id}/chat/status`)
            .catch(() => ({ data: { indexed: false, chunks_indexed: 0 } })),
        ]);

        if (isMounted) {
          const loadedDoc: DocumentItem = docRes.data.document;
          setDocumentData(loadedDoc);
          setSigners(docRes.data.signers || []);
          setTabs(tabsRes.data.tabs || []);
          setIsChatIndexed(Boolean(chatStatusRes.data?.indexed));
          setIndexedChunksCount(chatStatusRes.data?.chunks_indexed ?? 0);

          if (
            loadedDoc?.audit_status === "completed" ||
            loadedDoc?.audit_status === "failed"
          ) {
            setAuditing(false);
          }

          if (auditRes.data.audit) {
            setAuditData({
              ...auditRes.data.audit,
              flags_data:
                typeof auditRes.data.audit.flags_data === "string"
                  ? JSON.parse(auditRes.data.audit.flags_data)
                  : auditRes.data.audit.flags_data || [],
            });
          } else {
            setAuditData(null);
          }
          setRedactions(auditRes.data.entities || []);
          setLoading(false);
        }
      } catch {
        if (isMounted) {
          setError("Failed to load document workspace.");
          setLoading(false);
        }
      }
    }

    void loadWorkspaceData();

    return () => {
      isMounted = false;
    };
  }, [id, reloadTrigger]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isSendingChat]);

  const refreshWorkspace = useCallback(() => {
    setReloadTrigger((prev) => prev + 1);
  }, []);

  const handleAuditCompleted = useCallback(() => {
    setAuditing(false);
    setDocumentData((prev) =>
      prev ? { ...prev, audit_status: "completed" } : prev,
    );
    refreshWorkspace();
  }, [refreshWorkspace]);

  const handleAuditFailed = useCallback(() => {
    setAuditing(false);
    setDocumentData((prev) =>
      prev ? { ...prev, audit_status: "failed" } : prev,
    );
    refreshWorkspace();
  }, [refreshWorkspace]);

  const isAuditRunning =
    auditing ||
    documentData?.audit_status === "queued" ||
    documentData?.audit_status === "processing";

  // Fallback status poller so Compliance Score & redactions always update automatically
  useEffect(() => {
    if (!id || !isAuditRunning) return;

    const interval = window.setInterval(async () => {
      try {
        const docRes = await apiClient.get(`/documents/${id}`);
        const status = docRes.data?.document?.audit_status;
        if (status === "completed") {
          handleAuditCompleted();
        } else if (status === "failed") {
          handleAuditFailed();
        }
      } catch {
        // Ignore transient polling errors while worker runs
      }
    }, 2500);

    return () => window.clearInterval(interval);
  }, [id, isAuditRunning, handleAuditCompleted, handleAuditFailed]);

  // Privacy-Preserving RAG Indexing & Chat Handlers
  const handleIndexForChat = async () => {
    if (!id) return;
    setIsIndexingChat(true);
    try {
      const res = await apiClient.post(`/documents/${id}/ingest`);
      const count = res.data?.chunks_indexed ?? 0;
      setIsChatIndexed(true);
      setIndexedChunksCount(count);
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `Document indexed with Zero-Leakage Surrogate Shield (${count} sanitized chunks). Ask anything about clauses, obligations, liability caps, or dates.`,
        },
      ]);
    } catch (err: unknown) {
      const resp = (
        err as { response?: { data?: { error?: string; message?: string } } }
      )?.response?.data;
      setError(
        resp?.message || resp?.error || "Failed to index document for AI chat.",
      );
    } finally {
      setIsIndexingChat(false);
    }
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const question = chatInput.trim();
    if (!question || !id || isSendingChat) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
    };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setIsSendingChat(true);

    try {
      const res = await apiClient.post(`/documents/${id}/chat`, { question });
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.data?.answer || "No response received.",
        citations: res.data?.citations || [],
      };
      setChatMessages((prev) => [...prev, assistantMsg]);
    } catch (err: unknown) {
      const resp = (
        err as { response?: { data?: { error?: string; message?: string } } }
      )?.response?.data;
      setChatMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            resp?.message || resp?.error || "Error querying document AI.",
        },
      ]);
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleJumpToPage = (pageNumber: number) => {
    const pageEl = document.getElementById(`pdf-page-${pageNumber}`);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedPage(pageNumber);
      setTimeout(() => setHighlightedPage(null), 2200);
    }
  };

  // Hardened PDF Flattening & Export Handler
  const handleExportPdf = async (type: "redacted" | "signed") => {
    if (!id) return;
    try {
      setExportingType(type);
      const response = await apiClient.get(
        `/documents/${id}/export?type=${type}`,
        {
          responseType: "blob",
        },
      );

      const blobUrl = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" }),
      );
      const link = document.createElement("a");
      link.href = blobUrl;
      link.setAttribute(
        "download",
        `${type}_${documentData?.original_filename || "document.pdf"}`,
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Export failed:", err);
      setError("Failed to generate hardened PDF export.");
    } finally {
      setExportingType(null);
    }
  };

  // Async Audit Dispatch
  const handleRunAudit = async () => {
    try {
      setAuditing(true);
      setError(null);
      await apiClient.post(`/documents/${id}/audit`);
      setDocumentData((prev) =>
        prev ? { ...prev, audit_status: "processing" } : prev,
      );
    } catch {
      setError("Failed to enqueue AI security audit.");
      setAuditing(false);
    }
  };

  // Legal Approval Triage Handler
  const handleTriageDecision = async (decision: "approved" | "rejected") => {
    try {
      setTriageLoading(true);
      setTriageError(null);
      await apiClient.post(`/documents/${id}/triage`, { decision });
      refreshWorkspace();
    } catch (err: unknown) {
      const resp = (
        err as { response?: { data?: { error?: string; message?: string } } }
      )?.response?.data;
      setTriageError(
        resp?.message || resp?.error || "Failed to record triage decision.",
      );
    } finally {
      setTriageLoading(false);
    }
  };

  // Tab Placement Handlers
  const handlePageClick = (
    pageNumber: number,
    e: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (!selectedTool) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const posXPercent = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
    const posYPercent = Math.max(
      0,
      Math.min(100, (clickY / rect.height) * 100),
    );

    const newTab: SignatureTab = {
      tab_type: selectedTool,
      page_number: pageNumber,
      pos_x: Number(posXPercent.toFixed(2)),
      pos_y: Number(posYPercent.toFixed(2)),
      width: selectedTool === "signature" ? 140 : 110,
      height: 40,
      is_required: true,
      signer_id: signers[0]?.id || null,
    };

    setTabs((prev) => [...prev, newTab]);
    setSelectedTool(null);
  };

  const handleRemoveTab = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveTabs = async () => {
    try {
      setSaving(true);
      setSaveMessage(null);
      await apiClient.post(`/documents/${id}/tabs`, { tabs });
      setSaveMessage("Tabs saved successfully!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch {
      setError("Failed to save tab placements.");
    } finally {
      setSaving(false);
    }
  };

  const handleTabMouseDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setDraggingTabIdx(index);
    dragStartPos.current = { x: e.clientX, y: e.clientY };
  };

  const handlePageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (draggingTabIdx === null || !dragStartPos.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const posXPercent = Math.max(
      0,
      Math.min(90, (currentX / rect.width) * 100),
    );
    const posYPercent = Math.max(
      0,
      Math.min(95, (currentY / rect.height) * 100),
    );

    setTabs((prev) =>
      prev.map((tab, idx) =>
        idx === draggingTabIdx
          ? {
              ...tab,
              pos_x: Number(posXPercent.toFixed(2)),
              pos_y: Number(posYPercent.toFixed(2)),
            }
          : tab,
      ),
    );
  };

  const handlePageMouseUp = () => {
    setDraggingTabIdx(null);
    dragStartPos.current = null;
  };

  const handleAddSigner = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipientEmail || !recipientName) return;

    try {
      setAddingRecipient(true);
      const res = await apiClient.post(`/documents/${id}/signers`, {
        email: recipientEmail,
        full_name: recipientName,
      });
      setSigners((prev) => [...prev, res.data.signer]);
      setRecipientEmail("");
      setRecipientName("");
      setShowAddRecipient(false);
    } catch (err: unknown) {
      const resp = (
        err as { response?: { data?: { error?: string; message?: string } } }
      )?.response?.data;
      setError(resp?.message || resp?.error || "Failed to add recipient.");
    } finally {
      setAddingRecipient(false);
    }
  };

  const copySigningLink = (token: string) => {
    const link = `${window.location.origin}/sign/${token}`;
    navigator.clipboard.writeText(link);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm">Preparing document workspace...</p>
      </div>
    );
  }

  if (error && !documentData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mb-3" />
        <h2 className="text-lg font-bold text-white mb-1">
          Document Load Error
        </h2>
        <p className="text-sm text-slate-400 mb-4">{error}</p>
        <button
          onClick={() => navigate("/dashboard")}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm transition"
        >
          Back to Dashboard
        </button>
      </div>
    );
  }

  const pdfUrl = `http://localhost:3000${documentData?.file_path}`;
  const isApproved = documentData?.approval_status === "approved";
  const isRejected = documentData?.approval_status === "rejected";
  const hasHighRiskUnapproved = auditData?.risk_level === "High" && !isApproved;

  return (
    <div className="h-screen w-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden font-sans select-none">
      {/* Top Header Bar */}
      <header className="h-14 border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-xl px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white leading-tight truncate max-w-sm">
                {documentData?.title}
              </h1>
              {documentData?.approval_status && (
                <span
                  className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                    isApproved
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      : isRejected
                        ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                  }`}
                >
                  {documentData.approval_status.replace("_", " ")}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 truncate">
              {documentData?.original_filename} • {numPages}{" "}
              {numPages === 1 ? "Page" : "Pages"}
            </p>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1 bg-slate-950/60 border border-slate-800 rounded-lg p-1">
          <button
            onClick={() => setScale((s) => Math.max(0.6, s - 0.1))}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs px-2 font-mono text-slate-300">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(2.0, s + 0.1))}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Save, Export & Status Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleExportPdf("redacted")}
            disabled={exportingType !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-medium transition disabled:opacity-50"
            title="Download PDF with scrubbed PII redactions"
          >
            {exportingType === "redacted" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            ) : (
              <Download className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>Redacted PDF</span>
          </button>

          <button
            onClick={() => handleExportPdf("signed")}
            disabled={exportingType !== null}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition disabled:opacity-50"
            title="Download flattened PDF with burned signatures & Certificate of Completion"
          >
            {exportingType === "signed" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
            ) : (
              <Download className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>Executed PDF</span>
          </button>

          <button
            onClick={() => setShowCertificateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 text-xs font-medium transition"
          >
            <Fingerprint className="w-3.5 h-3.5" />
            <span>Audit Seal</span>
          </button>

          <button
            onClick={() => setShowRedlineModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-medium transition"
          >
            <GitPullRequest className="w-3.5 h-3.5" />
            <span>Clause Redlines</span>
          </button>

          {redactions.length > 0 && (
            <button
              onClick={() => setShowRedactions(!showRedactions)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium transition ${
                showRedactions
                  ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                  : "bg-slate-800 border-slate-700 text-slate-300"
              }`}
            >
              {showRedactions ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
              <span>
                {showRedactions ? "Shield View" : "Plain View"} (
                {redactions.length})
              </span>
            </button>
          )}

          {saveMessage && (
            <span className="text-xs text-emerald-400 font-medium animate-in fade-in">
              {saveMessage}
            </span>
          )}

          <button
            onClick={handleSaveTabs}
            disabled={saving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            <span>{saving ? "Saving..." : "Save Placements"}</span>
          </button>
        </div>
      </header>

      {/* Inline Error Banner */}
      {error && documentData && (
        <div className="bg-rose-950/90 border-b border-rose-500/40 px-4 py-2 flex items-center justify-between text-xs text-rose-200 z-30 shrink-0">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-rose-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 3-Pane Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Toolbar: Fields Palette */}
        <aside className="w-60 border-r border-slate-800/80 bg-slate-900/30 backdrop-blur-xl p-4 flex flex-col gap-4 shrink-0">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
              Field Palette
            </h3>
            <p className="text-[11px] text-slate-500 mb-3">
              Click a tool, then click on any page to place it:
            </p>
            <div className="space-y-2">
              <button
                onClick={() =>
                  setSelectedTool(
                    selectedTool === "signature" ? null : "signature",
                  )
                }
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition ${
                  selectedTool === "signature"
                    ? "bg-indigo-600/20 border-indigo-500 text-indigo-300 shadow-sm shadow-indigo-500/20"
                    : "bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-200"
                }`}
              >
                <PenTool className="w-4 h-4 text-indigo-400" />
                <span>Signature</span>
              </button>

              <button
                onClick={() =>
                  setSelectedTool(
                    selectedTool === "initials" ? null : "initials",
                  )
                }
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition ${
                  selectedTool === "initials"
                    ? "bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-sm shadow-emerald-500/20"
                    : "bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-200"
                }`}
              >
                <UserCheck className="w-4 h-4 text-emerald-400" />
                <span>Initials</span>
              </button>

              <button
                onClick={() =>
                  setSelectedTool(selectedTool === "date" ? null : "date")
                }
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition ${
                  selectedTool === "date"
                    ? "bg-amber-600/20 border-amber-500 text-amber-300 shadow-sm shadow-amber-500/20"
                    : "bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-200"
                }`}
              >
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>Date Signed</span>
              </button>

              <button
                onClick={() =>
                  setSelectedTool(selectedTool === "text" ? null : "text")
                }
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-medium border transition ${
                  selectedTool === "text"
                    ? "bg-cyan-600/20 border-cyan-500 text-cyan-300 shadow-sm shadow-cyan-500/20"
                    : "bg-slate-800/60 hover:bg-slate-800 border-slate-700/60 text-slate-200"
                }`}
              >
                <Type className="w-4 h-4 text-cyan-400" />
                <span>Text Field</span>
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-slate-800/60 text-[11px] text-slate-500 space-y-1">
            <p className="font-semibold text-slate-400">
              Placed Tabs: {tabs.length}
            </p>
            <p>Drag any tab to reposition.</p>
          </div>
        </aside>

        {/* Center Stage: Multi-Page Canvas with Redaction & Tab Overlays */}
        <main
          className="flex-1 bg-slate-950/80 overflow-y-auto p-8 flex flex-col items-center"
          onMouseUp={handlePageMouseUp}
        >
          <Document
            file={{ url: pdfUrl }}
            onLoadSuccess={({ numPages: loadedPages }) =>
              setNumPages(loadedPages)
            }
            loading={
              <div className="flex items-center gap-2 text-slate-400 py-12">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                <span>Rendering pages...</span>
              </div>
            }
          >
            {Array.from(new Array(numPages), (_, index) => {
              const pageNumber = index + 1;
              const pageTabs = tabs.filter((t) => t.page_number === pageNumber);
              const pageRedactions = redactions.filter(
                (r) => r.page_number === pageNumber,
              );

              return (
                <div
                  key={`page_${pageNumber}`}
                  id={`pdf-page-${pageNumber}`}
                  onClick={(e) => handlePageClick(pageNumber, e)}
                  onMouseMove={handlePageMouseMove}
                  className={`relative mb-6 shadow-2xl rounded-sm overflow-hidden border border-slate-800 transition-all duration-300 ${
                    highlightedPage === pageNumber
                      ? "ring-4 ring-amber-400/80"
                      : selectedTool
                        ? "cursor-crosshair ring-2 ring-indigo-500/30"
                        : "cursor-default"
                  }`}
                >
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderAnnotationLayer={false}
                    renderTextLayer={false}
                  />

                  {/* Redaction Entities Bounding-Box Overlay */}
                  {showRedactions &&
                    pageRedactions.map((red) => (
                      <div
                        key={red.id}
                        style={{
                          left: `${red.pos_x}%`,
                          top: `${red.pos_y}%`,
                          width: `${red.width}%`,
                          height: `${red.height}%`,
                        }}
                        title={`[${red.entity_type}] ${red.entity_text} (${Math.round(red.confidence * 100)}% conf)`}
                        className="absolute bg-rose-500/30 border border-rose-500/70 hover:bg-rose-500/50 backdrop-blur-[2px] transition pointer-events-auto rounded-sm group cursor-help z-10"
                      >
                        <span className="opacity-0 group-hover:opacity-100 absolute -top-5 left-0 text-[9px] font-mono bg-rose-950/90 text-rose-200 border border-rose-700/60 px-1 py-0.5 rounded shadow pointer-events-none whitespace-nowrap z-30 transition-opacity">
                          {red.entity_type}
                        </span>
                      </div>
                    ))}

                  {/* Render Tabs on Page Canvas */}
                  {pageTabs.map((tab, tabIdx) => {
                    const originalIdx = tabs.indexOf(tab);

                    return (
                      <div
                        key={`tab_${originalIdx}_${tabIdx}`}
                        onMouseDown={(e) => handleTabMouseDown(originalIdx, e)}
                        style={{
                          left: `${tab.pos_x}%`,
                          top: `${tab.pos_y}%`,
                        }}
                        className={`absolute -translate-x-1/2 -translate-y-1/2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border shadow-lg cursor-grab active:cursor-grabbing backdrop-blur-md transition-shadow z-20 ${
                          tab.tab_type === "signature"
                            ? "bg-indigo-950/80 border-indigo-500 text-indigo-300"
                            : tab.tab_type === "initials"
                              ? "bg-emerald-950/80 border-emerald-500 text-emerald-300"
                              : tab.tab_type === "date"
                                ? "bg-amber-950/80 border-amber-500 text-amber-300"
                                : "bg-cyan-950/80 border-cyan-500 text-cyan-300"
                        }`}
                      >
                        {tab.tab_type === "signature" && (
                          <PenTool className="w-3.5 h-3.5" />
                        )}
                        {tab.tab_type === "initials" && (
                          <UserCheck className="w-3.5 h-3.5" />
                        )}
                        {tab.tab_type === "date" && (
                          <Calendar className="w-3.5 h-3.5" />
                        )}
                        {tab.tab_type === "text" && (
                          <Type className="w-3.5 h-3.5" />
                        )}
                        <span className="text-[11px] font-semibold uppercase tracking-wider">
                          {tab.tab_type}
                        </span>
                        <button
                          onClick={(e) => handleRemoveTab(originalIdx, e)}
                          className="ml-1 p-0.5 rounded hover:bg-white/10 text-slate-400 hover:text-white"
                          title="Remove Tab"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </Document>
        </main>

        {/* Right Drawer: AI Risk Audit, Signers & Privacy-Preserving Chat */}
        <aside className="w-96 border-l border-slate-800/80 bg-slate-900/30 backdrop-blur-xl p-4 flex flex-col shrink-0 overflow-hidden space-y-4">
          {/* 3-Tab Drawer Switcher */}
          <div className="grid grid-cols-3 p-1 bg-slate-950/80 border border-slate-800 rounded-xl shrink-0">
            <button
              onClick={() => setActiveRightTab("audit")}
              className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold rounded-lg transition ${
                activeRightTab === "audit"
                  ? "bg-slate-800 text-indigo-300 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Risk Audit</span>
            </button>
            <button
              onClick={() => setActiveRightTab("signers")}
              className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold rounded-lg transition ${
                activeRightTab === "signers"
                  ? "bg-slate-800 text-indigo-300 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Signers ({signers.length})</span>
            </button>
            <button
              onClick={() => setActiveRightTab("chat")}
              className={`flex items-center justify-center gap-1 py-1.5 text-[11px] font-semibold rounded-lg transition ${
                activeRightTab === "chat"
                  ? "bg-slate-800 text-amber-300 shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>AI Chat</span>
            </button>
          </div>

          {/* Tab 1: AI Risk Engine & Legal Gatekeeper */}
          {activeRightTab === "audit" && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {/* Asynchronous Live WebSocket Tracker */}
              {isAuditRunning && id && (
                <div className="p-3 bg-slate-950/80 border border-indigo-500/30 rounded-xl space-y-2">
                  <p className="text-[11px] font-semibold text-indigo-300">
                    Live Scan Progress
                  </p>
                  <AuditProgressTracker
                    documentId={id}
                    onComplete={handleAuditCompleted}
                    onError={handleAuditFailed}
                  />
                </div>
              )}

              {/* Legal Triage & Approval Gate Banner */}
              <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Lock className="w-3 h-3 text-indigo-400" />
                    Legal Approval Gate
                  </span>
                  <span
                    className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      isApproved
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : isRejected
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                    }`}
                  >
                    {documentData?.approval_status || "draft"}
                  </span>
                </div>

                {triageError && (
                  <p className="text-[11px] text-rose-400 bg-rose-950/40 p-2 rounded-lg border border-rose-900/50">
                    {triageError}
                  </p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleTriageDecision("approved")}
                    disabled={triageLoading || isApproved}
                    className="flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-40 transition"
                  >
                    {triageLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    <span>
                      {isApproved ? "Approved" : "Approve for Signing"}
                    </span>
                  </button>

                  <button
                    onClick={() => handleTriageDecision("rejected")}
                    disabled={triageLoading || isRejected}
                    className="py-1.5 px-3 rounded-lg text-xs font-semibold border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 disabled:opacity-40 transition"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Risk Overview
                </span>
                <button
                  onClick={handleRunAudit}
                  disabled={isAuditRunning}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-[10px] font-semibold text-indigo-300 transition disabled:opacity-50"
                >
                  {isAuditRunning
                    ? "Scanning..."
                    : auditData
                      ? "Re-Audit"
                      : "Run Audit"}
                </button>
              </div>

              {auditData ? (
                <div className="space-y-3">
                  <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500">
                        Compliance Score
                      </p>
                      <p className="text-2xl font-black text-white font-mono">
                        {auditData.compliance_score}
                        <span className="text-xs text-slate-500">/100</span>
                      </p>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase border ${
                        auditData.risk_level === "Low"
                          ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                          : auditData.risk_level === "Medium"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                      }`}
                    >
                      {auditData.risk_level} Risk
                    </span>
                  </div>

                  <button
                    onClick={() => setShowRedlineModal(true)}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition"
                  >
                    <GitPullRequest className="w-3.5 h-3.5" />
                    <span>Review & Redline Clauses</span>
                  </button>

                  {auditData.flags_data.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-slate-300">
                        Flagged Clauses ({auditData.flags_data.length})
                      </p>
                      {auditData.flags_data.map((flag, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 bg-slate-950/70 border border-amber-500/30 rounded-xl text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold text-amber-300 truncate max-w-42.5">
                              {flag.title}
                            </span>
                            <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono">
                              {flag.severity}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">
                            {flag.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs text-emerald-300">
                      <ShieldCheck className="w-4 h-4 shrink-0" />
                      <span>No critical liability exposure detected.</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-slate-950/40 border border-slate-800 rounded-xl text-xs text-slate-400 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Document not audited yet. Click "Run Audit" to scan for PII
                    and clause risks.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Tab 2: Recipients */}
          {activeRightTab === "signers" && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-1">
              {hasHighRiskUnapproved && (
                <div className="p-3 bg-amber-950/40 border border-amber-500/40 rounded-xl text-xs text-amber-300 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    Approval Gate Active
                  </p>
                  <p className="text-[11px] opacity-90">
                    High Risk clauses must be redlined and approved by Legal
                    Counsel before signing invites can be dispatched.
                  </p>
                </div>
              )}

              {isRejected && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/40 rounded-xl text-xs text-rose-300 space-y-1">
                  <p className="font-bold flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    Review Rejected
                  </p>
                  <p className="text-[11px] opacity-90">
                    Legal Counsel rejected this document. Address clause
                    findings before adding signers.
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Manage Signers
                </span>
                <button
                  onClick={() => setShowAddRecipient(!showAddRecipient)}
                  disabled={hasHighRiskUnapproved || isRejected}
                  className="p-1 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition"
                  title={
                    hasHighRiskUnapproved
                      ? "Legal approval required first"
                      : "Add Recipient"
                  }
                >
                  <UserPlus className="w-4 h-4" />
                </button>
              </div>

              {showAddRecipient && (
                <form
                  onSubmit={handleAddSigner}
                  className="p-3 bg-slate-950/80 border border-indigo-500/30 rounded-xl space-y-2 mb-3"
                >
                  <input
                    type="text"
                    placeholder="Signer Full Name"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <input
                    type="email"
                    placeholder="signer@example.com"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    required
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="flex justify-end gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setShowAddRecipient(false)}
                      className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white rounded-lg"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={addingRecipient}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-medium disabled:opacity-50"
                    >
                      {addingRecipient ? "Adding..." : "Add"}
                    </button>
                  </div>
                </form>
              )}

              {signers.length === 0 ? (
                <div className="p-3 bg-slate-950/40 border border-slate-800/80 rounded-xl text-xs text-slate-400 text-center">
                  No signers assigned yet. Click the + button above to add one.
                </div>
              ) : (
                <div className="space-y-2">
                  {signers.map((s) => (
                    <div
                      key={s.id}
                      className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl text-xs space-y-2"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-slate-200 truncate">
                            {s.full_name}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {s.email}
                          </p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {s.status}
                        </span>
                      </div>

                      {s.token && (
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                          <button
                            onClick={() => copySigningLink(s.token!)}
                            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300"
                          >
                            <Copy className="w-3 h-3" />
                            <span>
                              {copiedToken === s.token
                                ? "Copied Link!"
                                : "Copy Link"}
                            </span>
                          </button>
                          <a
                            href={`/sign/${s.token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-slate-400 hover:text-white"
                            title="Open Portal"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Privacy-Preserving AI Document Chat */}
          {activeRightTab === "chat" && (
            <div className="flex flex-col flex-1 overflow-hidden">
              {/* Zero-Leakage Surrogate Shield Banner */}
              <div className="p-3 mb-3 rounded-xl bg-emerald-950/35 border border-emerald-500/30 flex items-center justify-between gap-2 shrink-0">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="truncate">Zero-Leakage Surrogate RAG</span>
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                    {isChatIndexed
                      ? `Indexed (${indexedChunksCount} chunks) • PII masked before LLM`
                      : "PII masked into <SURROGATE> tokens before embedding"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleIndexForChat}
                  disabled={isIndexingChat}
                  className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 disabled:opacity-50 shrink-0 transition flex items-center gap-1"
                >
                  {isIndexingChat && (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  )}
                  <span>
                    {isIndexingChat
                      ? "Indexing..."
                      : isChatIndexed
                        ? "Re-Index"
                        : "Index PDF"}
                  </span>
                </button>
              </div>

              {/* Chat Messages Feed */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1 select-text">
                {chatMessages.length === 0 ? (
                  <div className="text-center py-8 px-4 text-slate-400 text-xs space-y-2 bg-slate-950/40 border border-slate-800/80 rounded-xl">
                    <p className="font-semibold text-slate-200">
                      Ask anything about this contract
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      {isChatIndexed
                        ? 'Try: "Who are the parties involved?" or "What are the termination & liability obligations?"'
                        : 'Click "Index PDF" above to sanitize PII and generate local pgvector embeddings.'}
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`p-3 rounded-xl text-xs leading-relaxed ${
                        msg.role === "user"
                          ? "bg-amber-500/15 border border-amber-500/30 text-amber-100 ml-5"
                          : "bg-slate-950/80 border border-slate-800 text-slate-200 mr-2"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>

                      {msg.citations && msg.citations.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-800/90 flex flex-wrap gap-1.5">
                          {msg.citations.map((cit, idx) => (
                            <button
                              key={`${cit.chunk_id}-${idx}`}
                              type="button"
                              onClick={() => handleJumpToPage(cit.page_number)}
                              title={cit.snippet}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/35 text-[10px] font-semibold transition cursor-pointer"
                            >
                              <FileText className="w-2.5 h-2.5" />
                              <span>
                                Page {cit.page_number} (
                                {Math.round(cit.similarity * 100)}%)
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}

                {isSendingChat && (
                  <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs text-slate-400 flex items-center gap-2 mr-4">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                    <span>Searching sanitized vectors & synthesizing...</span>
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Query Input Bar */}
              <form
                onSubmit={handleSendChat}
                className="mt-3 pt-3 border-t border-slate-800 flex gap-2 shrink-0"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder={
                    isChatIndexed
                      ? "Ask about clauses, liability, dates..."
                      : "Index PDF first to enable chat..."
                  }
                  disabled={!isChatIndexed || isSendingChat}
                  className="flex-1 bg-slate-950/90 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={
                    !isChatIndexed || isSendingChat || !chatInput.trim()
                  }
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-50 transition flex items-center gap-1"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}
        </aside>
      </div>

      {/* Redline Drawer / Modal Overlay */}
      {showRedlineModal && id && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
              <div className="flex items-center gap-2">
                <GitPullRequest className="w-5 h-5 text-indigo-400" />
                <h2 className="text-sm font-bold text-white">
                  Contract Clause Redlining & AI Remediation
                </h2>
              </div>
              <button
                onClick={() => {
                  setShowRedlineModal(false);
                  refreshWorkspace();
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              <ClauseRedlineManager documentId={id} />
            </div>
          </div>
        </div>
      )}

      {/* Cryptographic Certificate & Tamper Seal Modal */}
      {showCertificateModal && id && (
        <AuditCertificateModal
          documentId={id}
          onClose={() => setShowCertificateModal(false)}
        />
      )}
    </div>
  );
};
