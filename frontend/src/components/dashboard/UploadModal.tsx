import React, { useState, useRef } from "react";
import {
  UploadCloud,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { isAxiosError } from "axios";
import { apiClient } from "../../api/client";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUploadSuccess: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onUploadSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (selectedFile: File) => {
    if (selectedFile.type !== "application/pdf") {
      setError("Only PDF documents are supported.");
      return;
    }
    if (selectedFile.size > 20 * 1024 * 1024) {
      setError("File size must be under 20MB.");
      return;
    }
    setError(null);
    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.pdf$/i, ""));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files?.[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a PDF document.");
      return;
    }

    setIsUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title || file.name);

    try {
      await apiClient.post("/documents/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFile(null);
      setTitle("");
      onUploadSuccess();
      onClose();
    } catch (err: unknown) {
      if (isAxiosError<{ error: string }>(err)) {
        setError(err.response?.data?.error || "Failed to upload document.");
      } else {
        setError("An unexpected error occurred during upload.");
      }
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white tracking-tight">
            Upload New Envelope
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center gap-2 text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
              isDragOver
                ? "border-indigo-500 bg-indigo-500/10"
                : file
                  ? "border-emerald-500/40 bg-emerald-500/5"
                  : "border-slate-800 hover:border-slate-700 bg-slate-950/40"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) =>
                e.target.files?.[0] && handleFileSelect(e.target.files[0])
              }
            />

            {file ? (
              <div className="flex items-center justify-center gap-3">
                <CheckCircle2 className="w-7 h-7 text-emerald-400 shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-medium text-slate-200 truncate max-w-xs">
                    {file.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <UploadCloud className="w-8 h-8 text-indigo-400 mx-auto" />
                <p className="text-sm font-medium text-slate-300">
                  Click to select PDF or drag & drop
                </p>
                <p className="text-xs text-slate-500">
                  PDF documents up to 20MB
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Envelope Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Master Services Agreement"
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 rounded-xl text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!file || isUploading}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition disabled:opacity-50"
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UploadCloud className="w-4 h-4" />
              )}
              <span>{isUploading ? "Uploading..." : "Upload Document"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
