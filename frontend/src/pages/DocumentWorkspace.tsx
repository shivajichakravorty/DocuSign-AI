import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Document, Page } from "react-pdf";
import "../utils/pdfWorker";
import { apiClient } from "../api/client";
import type { DocumentItem } from "../types/documents";
import type { SignatureTab, TabType } from "../types/tabs";
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
} from "lucide-react";

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

    const fetchWorkspaceData = async () => {
      try {
        setLoading(true);
        const [docRes, tabsRes, auditRes] = await Promise.all([
          apiClient.get(`/documents/${id}`),
          apiClient.get(`/documents/${id}/tabs`),
          apiClient.get(`/documents/${id}/audit`),
        ]);
        if (isMounted) {
          setDocumentData(docRes.data.document);
          setSigners(docRes.data.signers || []);
          setTabs(tabsRes.data.tabs || []);
          if (auditRes.data.audit) {
            setAuditData({
              ...auditRes.data.audit,
              flags_data:
                typeof auditRes.data.audit.flags_data === "string"
                  ? JSON.parse(auditRes.data.audit.flags_data)
                  : auditRes.data.audit.flags_data || [],
            });
          }
          setRedactions(auditRes.data.entities || []);
        }
      } catch {
        if (isMounted) {
          setError("Failed to load document workspace.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (id) {
      fetchWorkspaceData();
    }

    return () => {
      isMounted = false;
    };
  }, [id]);

  const handleRunAudit = async () => {
    try {
      setAuditing(true);
      setError(null);
      await apiClient.post(`/documents/${id}/audit`);
      // Refetch latest audit records and bounding boxes
      const auditRes = await apiClient.get(`/documents/${id}/audit`);
      if (auditRes.data.audit) {
        setAuditData({
          ...auditRes.data.audit,
          flags_data:
            typeof auditRes.data.audit.flags_data === "string"
              ? JSON.parse(auditRes.data.audit.flags_data)
              : auditRes.data.audit.flags_data || [],
        });
      }
      setRedactions(auditRes.data.entities || []);
    } catch {
      setError("Failed to complete AI security audit.");
    } finally {
      setAuditing(false);
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

  // Dragging Existing Placed Tabs Handlers
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

  // Recipient Handlers
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
    } catch {
      setError("Failed to add recipient.");
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
            <h1 className="text-sm font-bold text-white leading-tight truncate max-w-sm">
              {documentData?.title}
            </h1>
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

        {/* Save & Status Actions */}
        <div className="flex items-center gap-3">
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
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
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
                  onClick={(e) => handlePageClick(pageNumber, e)}
                  onMouseMove={handlePageMouseMove}
                  className={`relative mb-6 shadow-2xl rounded-sm overflow-hidden border border-slate-800 ${
                    selectedTool
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

        {/* Right Drawer: AI Risk Audit & Signers */}
        <aside className="w-80 border-l border-slate-800/80 bg-slate-900/30 backdrop-blur-xl p-4 flex flex-col shrink-0 overflow-y-auto space-y-6">
          {/* Section 1: AI Risk Engine */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>AI Risk Audit</span>
              </h3>
              <button
                onClick={handleRunAudit}
                disabled={auditing}
                className="px-2 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/40 text-[10px] font-semibold text-indigo-300 transition disabled:opacity-50"
              >
                {auditing
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

          {/* Section 2: Recipients */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Recipients ({signers.length})
              </h3>
              <button
                onClick={() => setShowAddRecipient(!showAddRecipient)}
                className="p-1 rounded-lg text-indigo-400 hover:text-indigo-300 hover:bg-slate-800 transition"
                title="Add Recipient"
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
        </aside>
      </div>
    </div>
  );
};
