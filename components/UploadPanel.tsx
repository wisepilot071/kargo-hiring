"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/Badge";

type UploadResult = {
  originalName: string;
  status: "OK" | "FAILED" | "REJECTED";
  candidateId?: string;
  name?: string | null;
  reason?: string;
};

const ACCEPT = ".docx,.pdf,.txt";

export function UploadPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [role, setRole] = useState<"" | "PM" | "SPM">("");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.name + f.size));
      return [...prev, ...incoming.filter((f) => !seen.has(f.name + f.size))];
    });
    setResults(null);
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  async function upload() {
    if (files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      for (const f of files) form.append("files", f);
      if (role) form.append("role", role);

      const res = await fetch("/api/candidates/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      setResults(data.results);
      setFiles([]);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong during upload.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="card animate-fade-up space-y-4 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-100">Upload candidate CVs</h2>
          <p className="mt-0.5 text-sm text-ink-400">
            Drop one or many resumes (.docx, .pdf, .txt). Assign a role now to score immediately, or leave
            unassigned and pick a role from each candidate&apos;s page later.
          </p>
        </div>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? "border-brand-500 bg-brand-500/[0.06]" : "border-black/10 hover:border-black/20"
        }`}
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500/15 text-brand-400">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12m0-12 4 4m-4-4-4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="text-sm text-ink-200">
          <span className="font-medium text-brand-600">Click to browse</span> or drag CVs here
        </div>
        <div className="text-xs text-ink-500">.docx · .pdf · .txt — up to 8MB each, any number of files</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <span key={f.name + f.size} className="flex items-center gap-2 rounded-lg border border-black/10 bg-ink-850 px-2.5 py-1.5 text-xs text-ink-200">
                {f.name}
                <button onClick={() => removeFile(i)} className="text-ink-500 hover:text-signal-weak" aria-label={`Remove ${f.name}`}>
                  ✕
                </button>
              </span>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            <div className="text-xs font-medium text-ink-400">
              Applying for which role? <span className="text-ink-500">(pick one, or decide later per candidate)</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "PM" as const, label: "Product Manager" },
                  { key: "SPM" as const, label: "Senior Product Manager" },
                  { key: "" as const, label: "Decide later" },
                ]
              ).map((opt) => (
                <button
                  key={opt.key || "later"}
                  type="button"
                  onClick={() => setRole(opt.key)}
                  className={`rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors ${
                    role === opt.key
                      ? "border-brand-500 bg-brand-500/15 text-brand-600"
                      : "border-black/10 bg-black/[0.02] text-ink-300 hover:border-black/20"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button className="btn-primary" onClick={upload} disabled={uploading}>
              {uploading ? "Uploading…" : `Upload ${files.length} CV${files.length > 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-signal-weak">{error}</p>}

      {results && (
        <div className="space-y-1.5 border-t border-black/[0.06] pt-4">
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-ink-850 px-3 py-2 text-sm">
              <span className="truncate text-ink-300">{r.originalName}</span>
              <div className="flex items-center gap-2">
                {r.status === "OK" && <Badge label="Imported" tone="strong" />}
                {r.status === "FAILED" && <Badge label="Parsing failed" tone="weak" />}
                {r.status === "REJECTED" && <Badge label="Rejected" tone="weak" />}
                {r.candidateId && r.status === "OK" && (
                  <Link href={`/candidates/${r.candidateId}`} className="text-xs text-brand-600 hover:underline">
                    View
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
