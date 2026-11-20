import React from "react";
import {
  X,
  ShieldCheck,
  FileSearch,
  Scale,
  PenTool,
  Lock,
  MessageSquareLock,
  Keyboard,
} from "lucide-react";

interface DocumentationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DocumentationModal: React.FC<DocumentationModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const sections = [
    {
      icon: <FileSearch className="w-4 h-4 text-indigo-400" />,
      title: "1. Spatial PII Detection & Shield View",
      description:
        'Uploaded PDFs are parsed page-by-page using pdfplumber, Microsoft Presidio, and spaCy NER to detect SSNs, emails, phone numbers, and names. Toggle "Shield View" in the workspace to inspect or hide normalized bounding boxes.',
    },
    {
      icon: <Scale className="w-4 h-4 text-amber-400" />,
      title: "2. Automated Legal Risk Audit & Approval Gate",
      description:
        "Contracts are audited for missing limitation-of-liability clauses, broad indemnification traps, and one-sided termination terms to compute a 0–100 Compliance Score. High-risk agreements require Legal Counsel approval before external invites can be sent.",
    },
    {
      icon: <PenTool className="w-4 h-4 text-emerald-400" />,
      title: "3. Multi-Party Tab Placement & Guest Signing",
      description:
        "Drag and drop Signature, Initials, Date, and Text fields onto any page. Generate tokenized guest links (/sign/:token) so external recipients can execute agreements without creating an account.",
    },
    {
      icon: <Lock className="w-4 h-4 text-purple-400" />,
      title: "4. Binary Redaction & SHA-256 Completion Certificates",
      description:
        "Exporting a Redacted or Executed PDF uses PyMuPDF to permanently scrub masked PII from the underlying binary stream, burn signature tabs onto pages, and append a cryptographic SHA-256 Certificate of Completion.",
    },
    {
      icon: <MessageSquareLock className="w-4 h-4 text-cyan-400" />,
      title: "5. Zero-Leakage Surrogate RAG Chat",
      description:
        "Index documents into pgvector with deterministic surrogate tokens (<PERSON_1>, <EMAIL_ADDRESS_1>) so raw PII never reaches external LLM endpoints while preserving inline page citations.",
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <div className="relative w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">
                DocuShield AI Documentation
              </h3>
              <p className="text-[11px] text-slate-400">
                Platform workflow, security architecture & shortcuts
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

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {sections.map((item) => (
            <div
              key={item.title}
              className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5"
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                {item.icon}
                <span>{item.title}</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}

          {/* Keyboard Shortcuts */}
          <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-indigo-200 font-medium">
              <Keyboard className="w-4 h-4 text-indigo-400" />
              <span>Quick Search Shortcut</span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-slate-300">
              <kbd className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono">
                ⌘K
              </kbd>
              <span>or</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 font-mono">
                Ctrl+K
              </kbd>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
