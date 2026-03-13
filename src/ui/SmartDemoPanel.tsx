/**
 * SmartDemoPanel.tsx
 * UI panel for the Smart Demo feature in the video editor.
 * Analyses cursor telemetry and auto-generates zoom regions + click highlights.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, Zap, MousePointerClick, Clock, ListOrdered, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ZoomRegion, AnnotationRegion, CursorTelemetryPoint } from "@/components/video-editor/types";
import { analyzeInteractions } from "@/smart-demo/interactionRecorder";
import { analyzeTimeline } from "@/smart-demo/timelineAnalyzer";
import { detectSilence, getSuggestedTrimRegions } from "@/smart-demo/inactivityDetector";
import { generateSteps, formatTimestamp } from "@/smart-demo/stepGenerator";
import { buildAutoZoomRegions } from "@/smart-demo/effects/autoZoom";
import { buildClickHighlights } from "@/smart-demo/effects/clickHighlight";
import type { DemoStep } from "@/smart-demo/stepGenerator";
import type { SilenceSegment } from "@/smart-demo/inactivityDetector";
import type { TrimRegion } from "@/components/video-editor/types";

interface SmartDemoPanelProps {
  cursorTelemetry: CursorTelemetryPoint[];
  duration: number; // seconds
  isAutoMode?: boolean; // auto-run when telemetry is ready
  onApplyZoomRegions: (regions: ZoomRegion[]) => void;
  onApplyAnnotations: (regions: AnnotationRegion[]) => void;
  onApplyTrimRegions?: (regions: TrimRegion[]) => void;
}

type ProcessingState = "idle" | "processing" | "done" | "error";

export function SmartDemoPanel({
  cursorTelemetry,
  duration,
  isAutoMode = false,
  onApplyZoomRegions,
  onApplyAnnotations,
  onApplyTrimRegions,
}: SmartDemoPanelProps) {
  const [state, setState] = useState<ProcessingState>("idle");
  const [steps, setSteps] = useState<DemoStep[]>([]);
  const [zoomCount, setZoomCount] = useState(0);
  const [clickCount, setClickCount] = useState(0);
  const [silences, setSilences] = useState<SilenceSegment[]>([]);
  const [applied, setApplied] = useState(false);
  const [trimApplied, setTrimApplied] = useState(false);
  const autoModeFiredRef = useRef(false);

  const runAnalysis = useCallback(() => {
    if (cursorTelemetry.length === 0) {
      setState("error");
      return;
    }

    setState("processing");
    setApplied(false);
    setTrimApplied(false);

    // Run analysis synchronously (fast enough for hackathon)
    try {
      const events = analyzeInteractions(cursorTelemetry);
      const segments = analyzeTimeline(events);
      const detectedSteps = generateSteps(segments);
      const zoomRegions = buildAutoZoomRegions(segments);
      const highlights = buildClickHighlights(segments);
      const silence = detectSilence(cursorTelemetry);
      const trimSuggestions = getSuggestedTrimRegions(silence, duration * 1000);

      setSteps(detectedSteps);
      setZoomCount(zoomRegions.length);
      setClickCount(highlights.length);
      setSilences(trimSuggestions);
      setState("done");
    } catch (err) {
      console.error("Smart demo analysis failed:", err);
      setState("error");
    }
  }, [cursorTelemetry, duration]);

  // Auto-run once when isAutoMode is true and telemetry is ready
  useEffect(() => {
    if (isAutoMode && !autoModeFiredRef.current && cursorTelemetry.length > 0) {
      autoModeFiredRef.current = true;
      runAnalysis();
    }
  }, [isAutoMode, cursorTelemetry, runAnalysis]);

  const handleApply = useCallback(() => {
    if (cursorTelemetry.length === 0) return;

    const events = analyzeInteractions(cursorTelemetry);
    const segments = analyzeTimeline(events);
    const zoomRegions = buildAutoZoomRegions(segments);
    const highlights = buildClickHighlights(segments);

    onApplyZoomRegions(zoomRegions);
    onApplyAnnotations(highlights);
    setApplied(true);
  }, [cursorTelemetry, onApplyZoomRegions, onApplyAnnotations]);

  const handleApplyTrim = useCallback(() => {
    if (!onApplyTrimRegions || silences.length === 0) return;

    const trimRegions: TrimRegion[] = silences.map((s, i) => ({
      id: `smart-trim-${i + 1}`,
      startMs: s.startMs,
      endMs: s.endMs,
    }));

    onApplyTrimRegions(trimRegions);
    setTrimApplied(true);
  }, [silences, onApplyTrimRegions]);

  const hasTelemetry = cursorTelemetry.length > 0;

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={15} className="text-purple-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-white/90">Smart Demo</span>
        {state === "done" && (
          <span className="ml-auto text-[10px] text-purple-300 bg-purple-900/40 rounded-full px-2 py-0.5">
            Ready
          </span>
        )}
      </div>

      {/* Description */}
      <p className="text-[11px] text-white/50 leading-relaxed">
        Automatically detect clicks, typing, and navigation from cursor data — then
        apply zoom effects and click highlights.
      </p>

      {/* No telemetry warning */}
      {!hasTelemetry && (
        <div className="rounded-lg bg-yellow-900/30 border border-yellow-700/30 px-3 py-2 text-[11px] text-yellow-300/80">
          No cursor telemetry found for this recording. Record a new video to use
          Smart Demo.
        </div>
      )}

      {/* Generate button */}
      {state !== "done" && (
        <Button
          onClick={runAnalysis}
          disabled={!hasTelemetry || state === "processing"}
          className="w-full gap-2 bg-purple-700 hover:bg-purple-600 text-white text-xs h-8 rounded-lg"
        >
          {state === "processing" ? (
            <>
              <RefreshCw size={13} className="animate-spin" />
              Analysing...
            </>
          ) : (
            <>
              <Zap size={13} />
              Generate Smart Demo
            </>
          )}
        </Button>
      )}

      {/* Results */}
      {state === "done" && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2">
            <StatBadge icon={<MousePointerClick size={11} />} label="Clicks" value={clickCount} color="blue" />
            <StatBadge icon={<Zap size={11} />} label="Zooms" value={zoomCount} color="purple" />
            <StatBadge icon={<Clock size={11} />} label="Silences" value={silences.length} color="amber" />
          </div>

          {/* Apply effects */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleApply}
              disabled={applied}
              className="w-full gap-2 text-xs h-8 rounded-lg bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-60"
            >
              {applied ? (
                <>
                  <CheckCircle2 size={13} className="text-green-400" />
                  Effects Applied
                </>
              ) : (
                <>
                  <Sparkles size={13} />
                  Apply Zoom &amp; Highlights
                </>
              )}
            </Button>

            {silences.length > 0 && onApplyTrimRegions && (
              <Button
                onClick={handleApplyTrim}
                disabled={trimApplied}
                variant="outline"
                className="w-full gap-2 text-xs h-8 rounded-lg border-amber-700/50 text-amber-300 hover:bg-amber-900/30 disabled:opacity-60 bg-transparent"
              >
                {trimApplied ? (
                  <>
                    <CheckCircle2 size={13} className="text-green-400" />
                    Silences Trimmed
                  </>
                ) : (
                  <>
                    <Clock size={13} />
                    Trim {silences.length} Silence{silences.length !== 1 ? "s" : ""}
                  </>
                )}
              </Button>
            )}

            <Button
              onClick={runAnalysis}
              variant="ghost"
              className="w-full gap-2 text-xs h-7 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5"
            >
              <RefreshCw size={11} />
              Re-analyse
            </Button>
          </div>

          {/* Steps */}
          {steps.length > 0 && (
            <div className="mt-1">
              <div className="flex items-center gap-1.5 mb-2">
                <ListOrdered size={12} className="text-white/40" />
                <span className="text-[11px] text-white/50 font-medium">Generated Steps</span>
              </div>
              <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
                {steps.map((step) => (
                  <StepCard key={step.number} step={step} />
                ))}
              </div>
            </div>
          )}

          {steps.length === 0 && (
            <div className="text-[11px] text-white/30 text-center py-2">
              No significant interactions detected. Try recording a longer demo.
            </div>
          )}
        </>
      )}

      {state === "error" && (
        <div className="rounded-lg bg-red-900/30 border border-red-700/30 px-3 py-2 text-[11px] text-red-300/80">
          Analysis failed. Make sure a video with cursor data is loaded.
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface StatBadgeProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "blue" | "purple" | "amber";
}

function StatBadge({ icon, label, value, color }: StatBadgeProps) {
  const colorClasses = {
    blue: "bg-blue-900/30 border-blue-700/30 text-blue-300",
    purple: "bg-purple-900/30 border-purple-700/30 text-purple-300",
    amber: "bg-amber-900/30 border-amber-700/30 text-amber-300",
  }[color];

  return (
    <div className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 ${colorClasses}`}>
      <div className="flex items-center gap-1 opacity-70">{icon}</div>
      <span className="text-base font-bold leading-none">{value}</span>
      <span className="text-[9px] opacity-60">{label}</span>
    </div>
  );
}

function StepCard({ step }: { step: DemoStep }) {
  const typeColors: Record<DemoStep["type"], string> = {
    click: "text-blue-400",
    typing: "text-green-400",
    "window-change": "text-orange-400",
    navigation: "text-slate-400",
    silence: "text-slate-500",
  };

  return (
    <div className="flex items-start gap-2 rounded-md bg-white/5 px-2.5 py-2">
      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-purple-800/60 text-purple-200 text-[9px] flex items-center justify-center font-bold mt-0.5">
        {step.number}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-medium text-white/85 truncate">{step.title}</span>
          <span className={`text-[9px] ml-auto flex-shrink-0 ${typeColors[step.type]}`}>
            {formatTimestamp(step.timestamp)}
          </span>
        </div>
        <p className="text-[10px] text-white/40 truncate">{step.description}</p>
      </div>
    </div>
  );
}
