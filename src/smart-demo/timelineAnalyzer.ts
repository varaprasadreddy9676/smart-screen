/**
 * timelineAnalyzer.ts
 * Converts raw interaction events into structured demo segments
 * with timing, zoom targets, and action metadata.
 */

import type { InteractionEvent } from "./interactionRecorder";

export type DemoAction = "click" | "typing" | "window-change" | "navigation" | "silence";

export interface DemoSegment {
  action: DemoAction;
  timestamp: number; // seconds
  endTimestamp?: number; // seconds (for duration-based segments)
  zoomTarget?: [number, number]; // normalized x, y (0-1)
  zoomScale?: number; // e.g. 1.4
  label?: string; // human-readable description
  app?: string;
}

// Zoom scale for each interaction type
const CLICK_ZOOM_SCALE = 1.4;
const TYPING_ZOOM_SCALE = 1.3;

// Minimum gap between consecutive zoom segments (seconds)
const MIN_ZOOM_GAP_S = 0.5;

/**
 * Convert interaction events to demo segments, filtering noise and
 * adding computed properties like zoom targets and labels.
 */
export function analyzeTimeline(events: InteractionEvent[]): DemoSegment[] {
  const segments: DemoSegment[] = [];
  let lastZoomAt = -MIN_ZOOM_GAP_S;

  for (const event of events) {
    const tooSoon = event.timestamp - lastZoomAt < MIN_ZOOM_GAP_S;

    switch (event.type) {
      case "click": {
        const segment: DemoSegment = {
          action: "click",
          timestamp: event.timestamp,
          zoomTarget: [event.x, event.y],
          zoomScale: CLICK_ZOOM_SCALE,
          label: `Click at (${Math.round(event.x * 100)}%, ${Math.round(event.y * 100)}%)`,
        };
        if (!tooSoon) {
          segments.push(segment);
          lastZoomAt = event.timestamp;
        }
        break;
      }

      case "typing": {
        const segment: DemoSegment = {
          action: "typing",
          timestamp: event.timestamp,
          endTimestamp: event.timestamp + (event.duration ?? 1),
          zoomTarget: [event.x, event.y],
          zoomScale: TYPING_ZOOM_SCALE,
          label: `Typing (${event.duration ? event.duration.toFixed(1) : "?"}s)`,
        };
        if (!tooSoon) {
          segments.push(segment);
          lastZoomAt = event.timestamp;
        }
        break;
      }

      case "window-change": {
        segments.push({
          action: "window-change",
          timestamp: event.timestamp,
          label: event.app ? `Switch to ${event.app}` : "Switch window",
          app: event.app,
        });
        break;
      }

      case "navigation": {
        segments.push({
          action: "navigation",
          timestamp: event.timestamp,
          label: "Navigate",
        });
        break;
      }
    }
  }

  // Sort by timestamp
  return segments.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Filter segments to only those that will produce visible zoom effects.
 */
export function getZoomableSegments(segments: DemoSegment[]): DemoSegment[] {
  return segments.filter((s) => s.zoomTarget && s.zoomScale);
}

/**
 * Get high-signal segments suitable for step generation.
 */
export function getSignificantSegments(segments: DemoSegment[]): DemoSegment[] {
  return segments.filter(
    (s) => s.action === "click" || s.action === "typing" || s.action === "window-change"
  );
}
