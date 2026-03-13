/**
 * autoZoom.ts
 * Generates ZoomRegion objects from demo segments (click / typing events).
 * Each zoom lasts for the relevant interaction duration plus a brief tail.
 */

import type { ZoomRegion, ZoomDepth } from "@/components/video-editor/types";
import type { DemoSegment } from "../timelineAnalyzer";

// Zoom parameters
const CLICK_ZOOM_DURATION_MS = 1500; // how long to stay zoomed in after a click
const TYPING_ZOOM_TAIL_MS = 800; // tail after typing ends
const ZOOM_EASE_IN_MS = 250; // ramp-up is 250ms (cosmetic – used for labeling)
const CLICK_ZOOM_DEPTH: ZoomDepth = 2; // 1.5x
const TYPING_ZOOM_DEPTH: ZoomDepth = 2;

let _idCounter = 1;

function nextId(): string {
  return `smart-zoom-${_idCounter++}`;
}

/**
 * Reset the ID counter (call before each Smart Demo apply).
 */
export function resetAutoZoomIds(): void {
  _idCounter = 1;
}

/**
 * Convert a click or typing DemoSegment into a ZoomRegion.
 */
function segmentToZoomRegion(segment: DemoSegment): ZoomRegion | null {
  if (!segment.zoomTarget) return null;

  const [cx, cy] = segment.zoomTarget;
  const startMs = Math.max(0, segment.timestamp * 1000 - ZOOM_EASE_IN_MS);

  let endMs: number;
  if (segment.action === "typing" && segment.endTimestamp) {
    endMs = segment.endTimestamp * 1000 + TYPING_ZOOM_TAIL_MS;
  } else {
    endMs = segment.timestamp * 1000 + CLICK_ZOOM_DURATION_MS;
  }

  const depth: ZoomDepth =
    segment.action === "typing" ? TYPING_ZOOM_DEPTH : CLICK_ZOOM_DEPTH;

  return {
    id: nextId(),
    startMs,
    endMs,
    depth,
    focus: { cx, cy },
  };
}

/**
 * Build ZoomRegions from all zoomable segments.
 * Merges overlapping regions so the timeline stays clean.
 */
export function buildAutoZoomRegions(segments: DemoSegment[]): ZoomRegion[] {
  resetAutoZoomIds();

  const zoomable = segments.filter(
    (s) => (s.action === "click" || s.action === "typing") && s.zoomTarget
  );

  const raw: ZoomRegion[] = zoomable
    .map(segmentToZoomRegion)
    .filter((r): r is ZoomRegion => r !== null);

  // Merge overlapping / adjacent zoom regions (within 300ms of each other)
  const merged: ZoomRegion[] = [];
  for (const region of raw) {
    const last = merged[merged.length - 1];
    if (last && region.startMs - last.endMs < 300) {
      // Extend the previous region and average the focus
      last.endMs = Math.max(last.endMs, region.endMs);
      last.focus = {
        cx: (last.focus.cx + region.focus.cx) / 2,
        cy: (last.focus.cy + region.focus.cy) / 2,
      };
    } else {
      merged.push({ ...region });
    }
  }

  return merged;
}
