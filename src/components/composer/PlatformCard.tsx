"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * PlatformCard — TASK-044 (PRD § 8 Screen: Composer).
 *
 * One card per platform: editable text, video-pairing dropdown, regenerate.
 * YouTube variant splits into title/description/tags fields. Uses shadcn
 * Card + Textarea + Button + Select.
 */

export type Platform = "youtube" | "linkedin" | "x" | "threads" | "instagram" | "tiktok";

const LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  linkedin: "LinkedIn",
  x: "X",
  threads: "Threads",
  instagram: "Instagram",
  tiktok: "TikTok",
};

export type VideoOption = { storageId: string; filename: string };

export function PlatformCard({
  platform,
  value,
  onChange,
  videos = [],
  selectedVideoId,
  onVideoChange,
  onRegenerate,
  regenerating = false,
}: {
  platform: Exclude<Platform, "youtube">;
  value: string;
  onChange: (v: string) => void;
  videos?: VideoOption[];
  selectedVideoId?: string;
  onVideoChange?: (id: string) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  return (
    <Card data-testid={`platform-card-${platform}`} className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-muted">
          {LABELS[platform]}
        </CardTitle>
        {onRegenerate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={regenerating}
            data-testid={`regenerate-${platform}`}
            className="h-7 px-2 font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            {regenerating ? "…" : "Regenerate"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          className="min-h-[100px] flex-1 resize-none font-sans text-[13px] leading-[1.5]"
          data-testid={`platform-input-${platform}`}
        />
        {videos.length > 0 && onVideoChange && (
          <Select
            items={videos.map((v) => ({ value: v.storageId, label: v.filename }))}
            value={selectedVideoId ?? null}
            onValueChange={(v) => {
              if (v) onVideoChange(v);
            }}
          >
            <SelectTrigger className="w-full font-mono text-[11px]">
              <SelectValue placeholder="Pair video" />
            </SelectTrigger>
            <SelectContent>
              {videos.map((v) => (
                <SelectItem key={v.storageId} value={v.storageId}>
                  {v.filename}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}

export function YouTubeCard({
  value,
  onChange,
  videos = [],
  selectedVideoId,
  onVideoChange,
  onRegenerate,
  regenerating = false,
}: {
  value: { title: string; description: string; tags: string[] };
  onChange: (v: { title: string; description: string; tags: string[] }) => void;
  videos?: VideoOption[];
  selectedVideoId?: string;
  onVideoChange?: (id: string) => void;
  onRegenerate?: () => void;
  regenerating?: boolean;
}) {
  const [tagsDraft, setTagsDraft] = useState(value.tags.join(", "));

  return (
    <Card data-testid="platform-card-youtube" className="flex flex-col md:col-span-2">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-muted">
          YouTube
        </CardTitle>
        {onRegenerate && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onRegenerate}
            disabled={regenerating}
            data-testid="regenerate-youtube"
            className="h-7 px-2 font-mono text-[11px] uppercase tracking-[0.08em]"
          >
            {regenerating ? "…" : "Regenerate"}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <input
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
          placeholder="Title"
          className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 font-sans text-[14px] font-medium text-on-surface placeholder:text-on-surface-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/40"
          data-testid="platform-input-youtube-title"
        />
        <Textarea
          value={value.description}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          rows={4}
          placeholder="Description"
          className="min-h-[80px] flex-1 resize-none font-sans text-[13px] leading-[1.5]"
          data-testid="platform-input-youtube-description"
        />
        <input
          value={tagsDraft}
          onChange={(e) => setTagsDraft(e.target.value)}
          onBlur={() =>
            onChange({
              ...value,
              tags: tagsDraft
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            })
          }
          placeholder="Tags, comma separated"
          className="w-full rounded-md border border-border bg-surface-raised px-3 py-2 font-mono text-[11px] text-on-surface placeholder:text-on-surface-subtle focus:border-border-strong focus:outline-none focus:ring-2 focus:ring-accent/40"
          data-testid="platform-input-youtube-tags"
        />
        {videos.length > 0 && onVideoChange && (
          <Select
            items={videos.map((v) => ({ value: v.storageId, label: v.filename }))}
            value={selectedVideoId ?? null}
            onValueChange={(v) => {
              if (v) onVideoChange(v);
            }}
          >
            <SelectTrigger className="w-full font-mono text-[11px]">
              <SelectValue placeholder="Pair video" />
            </SelectTrigger>
            <SelectContent>
              {videos.map((v) => (
                <SelectItem key={v.storageId} value={v.storageId}>
                  {v.filename}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </CardContent>
    </Card>
  );
}
