/**
 * Aspect-ratio detection + default pairing logic — TASK-046.
 *
 * detectVideoMeta probes an already-created blob URL via a throwaway
 * <video preload="metadata"> element. It never revokes the caller's URL.
 *
 * computeDefaultPairings implements PRD FR-007 / US-008: each platform
 * declares whether it prefers landscape (16:9) or portrait (9:16); the
 * best-matching upload wins, falling back to any other upload.
 */

export type AspectRatio = "16:9" | "9:16" | "1:1";
export type Orientation = "landscape" | "portrait";

export type VideoMeta = {
  aspectRatio?: AspectRatio;
  durationSeconds?: number;
};

/** Classify width/height ratio with generous tolerance around the buckets. */
function classify(width: number, height: number): AspectRatio {
  if (width <= 0 || height <= 0) return "16:9"; // sensible default for broken metadata
  const r = width / height;
  if (r > 1.2) return "16:9";
  if (r < 0.83) return "9:16";
  return "1:1";
}

/**
 * Read metadata from a blob URL. Resolves {} on load failure or after a
 * 5s timeout so uploads never hang on probing.
 */
export function detectVideoMeta(blobUrl: string): Promise<VideoMeta> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const done = (meta: VideoMeta) => {
      clearTimeout(timeout);
      video.removeAttribute("src");
      video.load();
      resolve(meta);
    };

    const timeout = setTimeout(() => done({}), 5_000);

    video.onloadedmetadata = () => {
      const aspectRatio =
        video.videoWidth > 0 ? classify(video.videoWidth, video.videoHeight) : undefined;
      const durationSeconds = Number.isFinite(video.duration)
        ? Math.round(video.duration)
        : undefined;
      done({ aspectRatio, durationSeconds });
    };
    video.onerror = () => done({});
    video.src = blobUrl;
  });
}

/**
 * Pick the best upload per platform given its orientation preference.
 * Priority: exact class match → any classified upload that isn't the exact
 * opposite class (square/unknown) → first upload at all.
 */
function pickUpload<P extends string>(
  uploads: Array<{ storageId: string; aspectRatio?: AspectRatio }>,
  prefs: Record<P, Orientation>,
  platform: P,
): string | undefined {
  if (uploads.length === 0) return undefined;
  const preferred: AspectRatio = prefs[platform] === "portrait" ? "9:16" : "16:9";
  const opposite: AspectRatio = prefs[platform] === "portrait" ? "16:9" : "9:16";

  const classified = uploads.filter((u) => u.aspectRatio);
  const exact = classified.find((u) => u.aspectRatio === preferred);
  if (exact) return exact.storageId;
  const soft = classified.find((u) => u.aspectRatio !== opposite);
  return (soft ?? uploads[0]).storageId;
}

/**
 * PRD FR-007 defaults. Returns one storageId per platform key whenever any
 * upload exists; callers decide how to merge with manual overrides.
 */
export function computeDefaultPairings<P extends string>(
  uploads: Array<{ storageId: string; aspectRatio?: AspectRatio }>,
  prefs: Record<P, Orientation>,
): Partial<Record<P, string>> {
  const result: Partial<Record<P, string>> = {};
  for (const platform of Object.keys(prefs) as P[]) {
    const id = pickUpload(uploads, prefs, platform);
    if (id) result[platform] = id;
  }
  return result;
}
