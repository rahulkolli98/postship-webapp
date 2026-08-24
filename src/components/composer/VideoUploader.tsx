"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

/**
 * VideoUploader — TASK-037 (PRD FR-003).
 *
 * Drag-drop or click-to-upload. mp4/mov/webm only, 200MB per file, max 2
 * videos. Files go to Convex file storage; storageIds are kept in local
 * state until posts.create (TASK-049) — no schema change here.
 *
 * Design: cream canvas is the parent (bg-surface); this card is
 * bg-surface-raised with dashed hairline dropzone, lime accent on drag.
 */

const MAX_BYTES = 200 * 1024 * 1024; // 200MB
const MAX_FILES = 2;

const ACCEPTED_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const ACCEPT_ATTR = ".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm";

type UploadedFile = {
  storageId: Id<"_storage">;
  filename: string;
  blobUrl: string; // local preview
};

function validateFiles(
  incoming: File[],
  existingCount: number,
): { valid: File[]; error: string | null } {
  if (existingCount + incoming.length > MAX_FILES) {
    return { valid: [], error: "Max 2 videos per post" };
  }
  for (const f of incoming) {
    if (f.size > MAX_BYTES) {
      return { valid: [], error: "Max 200MB per file" };
    }
    const byType = ACCEPTED_TYPES.has(f.type);
    const byExt = /\.(mp4|mov|webm)$/i.test(f.name);
    if (!byType && !byExt) {
      return { valid: [], error: "Only mp4, mov, webm supported" };
    }
  }
  return { valid: incoming, error: null };
}

export function VideoUploader() {
  const generateUploadUrl = useMutation(api.uploads.generateUploadUrl);
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Revoke blob URLs on unmount / replace.
  useEffect(() => {
    return () => {
      for (const f of files) URL.revokeObjectURL(f.blobUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadFiles = useCallback(
    async (fileList: File[]) => {
      setError(null);
      const { valid, error: validationError } = validateFiles(fileList, files.length);
      if (validationError) {
        setError(validationError);
        return;
      }
      if (valid.length === 0) return;

      setUploading(true);
      try {
        for (const file of valid) {
          const uploadUrl = await generateUploadUrl({});
          const res = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type || "video/mp4" },
            body: file,
          });
          if (!res.ok) {
            throw new Error(`Upload failed: ${res.status}`);
          }
          const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
          const blobUrl = URL.createObjectURL(file);
          setFiles((prev) => [...prev, { storageId, filename: file.name, blobUrl }]);
        }
      } catch {
        setError("Upload failed. Try again.");
      } finally {
        setUploading(false);
      }
    },
    [files.length, generateUploadUrl],
  );

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files);
    void uploadFiles(dropped);
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    // Reset so picking the same file twice still fires change.
    e.target.value = "";
    void uploadFiles(picked);
  }

  function removeAt(index: number) {
    setFiles((prev) => {
      const target = prev[index];
      if (target) URL.revokeObjectURL(target.blobUrl);
      return prev.filter((_, i) => i !== index);
    });
    setError(null);
  }

  return (
    <div data-testid="video-uploader" className="flex flex-col gap-4">
      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        aria-label="Upload videos"
        data-testid="video-dropzone"
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed bg-surface-raised px-6 py-10 text-center transition-colors ${
          dragOver ? "border-accent bg-accent-soft/40" : "border-border hover:border-border-strong"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="font-sans text-[15px] font-medium text-on-surface">
          {uploading ? "Uploading…" : "Drag videos here or click to upload"}
        </p>
        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-muted">
          mp4 · mov · webm · Max 200MB per file · Up to 2 videos
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTR}
          multiple
          className="hidden"
          onChange={onInputChange}
          data-testid="video-file-input"
        />
      </div>

      {error && (
        <p role="alert" className="font-sans text-[13px] text-error">
          {error}
        </p>
      )}

      {/* Previews */}
      {files.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {files.map((f, i) => (
            <div
              key={f.storageId}
              data-testid={`video-preview-${i}`}
              className="overflow-hidden rounded-lg border border-border bg-surface-raised"
            >
              <video
                src={f.blobUrl}
                controls
                muted
                playsInline
                className="aspect-video w-full object-cover"
              />
              <div className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="truncate font-mono text-[11px] text-on-surface-muted">
                  {f.filename}
                </span>
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${f.filename}`}
                  className="rounded-sm px-2 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-on-surface-subtle hover:bg-error/10 hover:text-error"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
