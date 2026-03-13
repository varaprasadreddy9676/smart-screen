/**
 * interactionRecorder.ts
 * Captures and processes interaction events during screen recording.
 * Uses cursor telemetry from the main process and derives interaction types
 * through velocity + position analysis.
 */

import type { CursorTelemetryPoint } from "@/components/video-editor/types";

export type InteractionType = "click" | "typing" | "window-change" | "navigation";

export interface InteractionEvent {
  type: InteractionType;
  x: number; // normalized 0-1
  y: number; // normalized 0-1
  timestamp: number; // seconds
  duration?: number; // seconds (for typing bursts)
  app?: string; // for window-change
}

// Velocity thresholds for interaction detection
const CLICK_VELOCITY_THRESHOLD = 0.005; // normalized units / 100ms
const CLICK_DWELL_MIN_MS = 150;
const CLICK_DWELL_MAX_MS = 800;
const TYPING_STILLNESS_THRESHOLD = 0.003;
const TYPING_MIN_DURATION_MS = 1000;
const WINDOW_CHANGE_DISTANCE_THRESHOLD = 0.6; // large jump = window change
const SAMPLE_INTERVAL_MS = 100;

function distance(a: CursorTelemetryPoint, b: CursorTelemetryPoint): number {
  return Math.sqrt((a.cx - b.cx) ** 2 + (a.cy - b.cy) ** 2);
}

function velocity(a: CursorTelemetryPoint, b: CursorTelemetryPoint): number {
  const dt = (b.timeMs - a.timeMs) / 1000;
  if (dt === 0) return 0;
  return distance(a, b) / dt;
}

/**
 * Analyse raw cursor telemetry and return a list of inferred interaction events.
 */
export function analyzeInteractions(
  telemetry: CursorTelemetryPoint[]
): InteractionEvent[] {
  if (telemetry.length < 3) return [];

  const events: InteractionEvent[] = [];

  let i = 1;
  while (i < telemetry.length - 1) {
    const prev = telemetry[i - 1];
    const curr = telemetry[i];
    const next = telemetry[i + 1];

    const vBefore = velocity(prev, curr);
    const vAfter = velocity(curr, next);

    // --- Window / app change: large instantaneous jump ---
    if (distance(prev, curr) > WINDOW_CHANGE_DISTANCE_THRESHOLD) {
      events.push({
        type: "window-change",
        x: curr.cx,
        y: curr.cy,
        timestamp: curr.timeMs / 1000,
      });
      i++;
      continue;
    }

    // --- Click: cursor moves, then stops briefly, then may move again ---
    if (
      vBefore > CLICK_VELOCITY_THRESHOLD &&
      vAfter < CLICK_VELOCITY_THRESHOLD
    ) {
      // Look ahead to confirm dwell (cursor stays still for a short period)
      let dwellEnd = i + 1;
      while (
        dwellEnd < telemetry.length &&
        velocity(telemetry[dwellEnd - 1], telemetry[dwellEnd]) < CLICK_VELOCITY_THRESHOLD
      ) {
        dwellEnd++;
      }

      const dwellMs =
        telemetry[Math.min(dwellEnd, telemetry.length - 1)].timeMs - curr.timeMs;

      if (dwellMs >= CLICK_DWELL_MIN_MS && dwellMs <= CLICK_DWELL_MAX_MS) {
        events.push({
          type: "click",
          x: curr.cx,
          y: curr.cy,
          timestamp: curr.timeMs / 1000,
        });
        i = dwellEnd;
        continue;
      }
    }

    // --- Typing: cursor completely still for > TYPING_MIN_DURATION_MS ---
    if (vBefore < TYPING_STILLNESS_THRESHOLD && vAfter < TYPING_STILLNESS_THRESHOLD) {
      let stillEnd = i + 1;
      while (
        stillEnd < telemetry.length &&
        velocity(telemetry[stillEnd - 1], telemetry[stillEnd]) < TYPING_STILLNESS_THRESHOLD
      ) {
        stillEnd++;
      }

      const stillMs =
        telemetry[Math.min(stillEnd, telemetry.length - 1)].timeMs - prev.timeMs;

      if (stillMs >= TYPING_MIN_DURATION_MS) {
        // Avoid duplicate typing events at same location
        const lastEvent = events[events.length - 1];
        if (!lastEvent || lastEvent.type !== "typing" || Math.abs(lastEvent.timestamp - prev.timeMs / 1000) > 2) {
          events.push({
            type: "typing",
            x: curr.cx,
            y: curr.cy,
            timestamp: prev.timeMs / 1000,
            duration: stillMs / 1000,
          });
        }
        i = stillEnd;
        continue;
      }
    }

    // --- Navigation: fast cursor movement covering significant distance ---
    const segment = telemetry.slice(Math.max(0, i - 2), i + 3);
    const totalDist = segment.reduce((sum, pt, idx) => {
      if (idx === 0) return sum;
      return sum + distance(segment[idx - 1], pt);
    }, 0);
    if (totalDist > 0.3 && vBefore > 0.05) {
      const lastEvent = events[events.length - 1];
      if (!lastEvent || lastEvent.type !== "navigation" || Math.abs(lastEvent.timestamp - curr.timeMs / 1000) > 1) {
        events.push({
          type: "navigation",
          x: curr.cx,
          y: curr.cy,
          timestamp: curr.timeMs / 1000,
        });
      }
    }

    i++;
  }

  // De-duplicate events that are very close in time (< 300ms apart)
  return events.filter((event, idx) => {
    if (idx === 0) return true;
    const prev = events[idx - 1];
    return !(event.type === prev.type && Math.abs(event.timestamp - prev.timestamp) < 0.3);
  });
}

/**
 * Fetch cursor telemetry from main process and return parsed interactions.
 */
export async function recordInteractions(videoPath?: string): Promise<InteractionEvent[]> {
  if (!window.electronAPI?.getCursorTelemetry) return [];

  const telemetry: CursorTelemetryPoint[] | null =
    await window.electronAPI.getCursorTelemetry(videoPath);

  if (!telemetry || telemetry.length === 0) return [];

  return analyzeInteractions(telemetry);
}

export { SAMPLE_INTERVAL_MS };
