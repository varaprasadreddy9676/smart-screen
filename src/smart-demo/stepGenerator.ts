/**
 * stepGenerator.ts
 * Generates human-readable tutorial steps from demo segments.
 * Uses simple heuristics to describe what the user was doing.
 */

import type { DemoSegment } from "./timelineAnalyzer";

export interface DemoStep {
  number: number;
  title: string;
  description: string;
  timestamp: number; // seconds
  type: DemoSegment["action"];
}

// Common UI region heuristics based on normalized screen position
function describeLocation(x: number, y: number): string {
  const hRegion = x < 0.33 ? "left" : x > 0.66 ? "right" : "center";
  const vRegion = y < 0.2 ? "top" : y > 0.8 ? "bottom" : y < 0.5 ? "upper" : "lower";

  if (vRegion === "top") return "the top navigation area";
  if (vRegion === "bottom") return "the bottom area";
  if (hRegion === "left" && vRegion === "upper") return "the left sidebar";
  if (hRegion === "right") return "the right panel";
  if (hRegion === "center" && vRegion === "lower") return "the main content area";
  return "the interface";
}

// Descriptions for common vertical positions (likely navigation bars, content, etc.)
function describeClickTarget(x: number, y: number): string {
  if (y < 0.08) return "the menu bar";
  if (y < 0.15) return "the navigation bar";
  if (y > 0.9) return "the status bar";
  if (x < 0.15) return "the sidebar";
  if (x > 0.85) return "the right panel";
  return describeLocation(x, y);
}

function makeStep(
  segment: DemoSegment,
  index: number,
  previousSegment?: DemoSegment
): DemoStep {

  switch (segment.action) {
    case "click": {
      const [x, y] = segment.zoomTarget ?? [0.5, 0.5];
      const target = describeClickTarget(x, y);
      const isRepeat =
        previousSegment?.action === "click" &&
        previousSegment.zoomTarget &&
        Math.abs(previousSegment.zoomTarget[0] - x) < 0.05 &&
        Math.abs(previousSegment.zoomTarget[1] - y) < 0.05;

      return {
        number: index + 1,
        title: isRepeat ? "Continue interaction" : `Click ${target}`,
        description: isRepeat
          ? `Continue interacting in ${target}`
          : `Click on ${target} to proceed`,
        timestamp: segment.timestamp,
        type: "click",
      };
    }

    case "typing": {
      const [x, y] = segment.zoomTarget ?? [0.5, 0.5];
      const location = describeLocation(x, y);
      const dur = segment.endTimestamp
        ? segment.endTimestamp - segment.timestamp
        : 2;
      return {
        number: index + 1,
        title: "Enter text",
        description: `Type in ${location} (${dur.toFixed(0)}s of input)`,
        timestamp: segment.timestamp,
        type: "typing",
      };
    }

    case "window-change": {
      const appName = segment.app ?? "another window";
      return {
        number: index + 1,
        title: `Switch to ${appName}`,
        description: `Switch focus to ${appName}`,
        timestamp: segment.timestamp,
        type: "window-change",
      };
    }

    case "navigation": {
      return {
        number: index + 1,
        title: "Navigate",
        description: "Navigate to a new area",
        timestamp: segment.timestamp,
        type: "navigation",
      };
    }

    default:
      return {
        number: index + 1,
        title: "Action",
        description: "User interaction",
        timestamp: segment.timestamp,
        type: segment.action,
      };
  }
}

/**
 * Generate an ordered list of tutorial steps from demo segments.
 */
export function generateSteps(segments: DemoSegment[]): DemoStep[] {
  // Only include segments that are meaningful for a tutorial
  const meaningful = segments.filter(
    (s) => s.action === "click" || s.action === "typing" || s.action === "window-change"
  );

  return meaningful.map((segment, idx) =>
    makeStep(segment, idx, idx > 0 ? meaningful[idx - 1] : undefined)
  );
}

/**
 * Format a timestamp in MM:SS format for display.
 */
export function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}
