/**
 * clickHighlight.ts
 * Generates AnnotationRegion objects that render click-pulse circles
 * on top of the video at each detected click position.
 *
 * Visual spec:
 *   - Animated pulse circle
 *   - Radius: ~30px (represented as % of video width)
 *   - Color: #4F8CFF
 *   - Duration: 600ms
 */

import type { AnnotationRegion } from "@/components/video-editor/types";
import type { DemoSegment } from "../timelineAnalyzer";

// Click-highlight visual constants
const HIGHLIGHT_COLOR = "#4F8CFF";
const HIGHLIGHT_BG_COLOR = "rgba(79,140,255,0.18)";
const HIGHLIGHT_DURATION_MS = 600;
const HIGHLIGHT_SIZE_PCT = 6; // % of video width for the circle diameter
const HIGHLIGHT_FONT_SIZE = 14;

let _idCounter = 1;

export function resetClickHighlightIds(): void {
  _idCounter = 1;
}

function nextId(): string {
  return `smart-click-${_idCounter++}`;
}

/**
 * Convert a click DemoSegment into an AnnotationRegion (circle highlight).
 * Uses a text annotation with a bullet character to simulate a pulse circle.
 */
function clickToAnnotation(segment: DemoSegment): AnnotationRegion | null {
  if (segment.action !== "click" || !segment.zoomTarget) return null;

  const [cx, cy] = segment.zoomTarget;

  // Convert normalized center to percentage-based top-left position
  // The annotation is centered on the click: shift by half the size
  const halfSize = HIGHLIGHT_SIZE_PCT / 2;
  const x = Math.max(0, Math.min(100 - HIGHLIGHT_SIZE_PCT, cx * 100 - halfSize));
  const y = Math.max(0, Math.min(100 - HIGHLIGHT_SIZE_PCT, cy * 100 - halfSize));

  const startMs = Math.max(0, segment.timestamp * 1000 - 50);
  const endMs = startMs + HIGHLIGHT_DURATION_MS;

  return {
    id: nextId(),
    startMs,
    endMs,
    type: "text",
    content: "●",
    textContent: "●",
    position: { x, y },
    size: { width: HIGHLIGHT_SIZE_PCT, height: HIGHLIGHT_SIZE_PCT },
    style: {
      color: HIGHLIGHT_COLOR,
      backgroundColor: HIGHLIGHT_BG_COLOR,
      fontSize: HIGHLIGHT_FONT_SIZE,
      fontFamily: "Inter",
      fontWeight: "bold",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "center",
    },
    zIndex: 100,
  };
}

/**
 * Build click-highlight AnnotationRegions from demo segments.
 */
export function buildClickHighlights(segments: DemoSegment[]): AnnotationRegion[] {
  resetClickHighlightIds();

  return segments
    .filter((s) => s.action === "click")
    .map(clickToAnnotation)
    .filter((a): a is AnnotationRegion => a !== null);
}
