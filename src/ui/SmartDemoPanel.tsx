/**
 * SmartDemoPanel.tsx
 * Smart Demo panel — auto-generates zoom regions, highlights, and silence trims
 * from cursor telemetry, and manages transcript/captions.
 */

import {
	type PublicTranscriptionConfig,
	type SaveTranscriptionConfigInput,
	type TranscriptionProviderOption,
	type TranscriptSegment,
} from "@shared/ai";
import {
	ChevronDown,
	ChevronUp,
	Clock,
	FileAudio2,
	FileText,
	Info,
	RefreshCw,
	Sparkles,
	Trash2,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type {
	AnnotationRegion,
	CaptionSettings,
	CursorTelemetryPoint,
	TrimRegion,
	ZoomRegion,
} from "@/components/video-editor/types";
import { buildAutoZoomRegions } from "@/smart-demo/effects/autoZoom";
import { buildClickHighlights } from "@/smart-demo/effects/clickHighlight";
import type { SilenceSegment } from "@/smart-demo/inactivityDetector";
import { detectSilence, getSuggestedTrimRegions } from "@/smart-demo/inactivityDetector";
import { analyzeInteractions } from "@/smart-demo/interactionRecorder";
import type { DemoStep } from "@/smart-demo/stepGenerator";
import { formatTimestamp, generateSteps } from "@/smart-demo/stepGenerator";
import { analyzeTimeline } from "@/smart-demo/timelineAnalyzer";

export interface SmartDemoPanelProps {
	cursorTelemetry: CursorTelemetryPoint[];
	duration: number;
	isAutoMode?: boolean;
	videoPath?: string | null;
	transcriptSegments: TranscriptSegment[];
	transcriptStatus: "idle" | "importing" | "transcribing" | "ready" | "error";
	transcriptError: string | null;
	captionSettings: CaptionSettings;
	transcriptionConfig: PublicTranscriptionConfig;
	transcriptionOptions: TranscriptionProviderOption[];
	onImportTranscript: () => Promise<void>;
	onTranscribeAudio: () => Promise<void>;
	onSaveTranscriptionConfig: (input: SaveTranscriptionConfigInput) => Promise<void>;
	onCaptionSettingsChange: (settings: Partial<CaptionSettings>) => void;
	onClearTranscript: () => void;
	onReviewTranscript: () => void;
	onApplyZoomRegions: (regions: ZoomRegion[]) => void;
	onApplyAnnotations: (regions: AnnotationRegion[]) => void;
	onApplyTrimRegions?: (regions: TrimRegion[]) => void;
	onApplyPolishDemo: () => void;
	onSeekToTime: (timeSeconds: number) => void;
}

type AnalysisState = "idle" | "processing" | "done" | "error";

export function SmartDemoPanel({
	cursorTelemetry,
	duration,
	isAutoMode = false,
	videoPath,
	transcriptSegments,
	transcriptStatus,
	transcriptError,
	captionSettings,
	transcriptionConfig,
	transcriptionOptions,
	onImportTranscript,
	onTranscribeAudio,
	onSaveTranscriptionConfig,
	onCaptionSettingsChange,
	onClearTranscript,
	onReviewTranscript,
	onApplyZoomRegions,
	onApplyAnnotations,
	onApplyTrimRegions,
	onApplyPolishDemo,
	onSeekToTime,
}: SmartDemoPanelProps) {
	const [analysisState, setAnalysisState] = useState<AnalysisState>("idle");
	const [steps, setSteps] = useState<DemoStep[]>([]);
	const [silenceCount, setSilenceCount] = useState(0);
	const [showSteps, setShowSteps] = useState(false);
	const autoModeFiredRef = useRef(false);

	// Cache computed regions so apply doesn't re-run the full analysis
	const pendingZoomsRef = useRef<ZoomRegion[]>([]);
	const pendingAnnotationsRef = useRef<AnnotationRegion[]>([]);
	const pendingSilencesRef = useRef<SilenceSegment[]>([]);

	const runAnalysis = useCallback(() => {
		if (cursorTelemetry.length === 0) {
			setAnalysisState("error");
			return;
		}

		setAnalysisState("processing");

		try {
			const events = analyzeInteractions(cursorTelemetry);
			const segments = analyzeTimeline(events);
			const detectedSteps = generateSteps(segments);
			const zoomRegions = buildAutoZoomRegions(segments);
			const highlights = buildClickHighlights(segments, { transcriptSegments });
			const silences = detectSilence(cursorTelemetry);
			const trimSuggestions = getSuggestedTrimRegions(silences, duration * 1000);

			pendingZoomsRef.current = zoomRegions;
			pendingAnnotationsRef.current = highlights;
			pendingSilencesRef.current = trimSuggestions;

			setSteps(detectedSteps);
			setSilenceCount(trimSuggestions.length);
			setAnalysisState("done");
		} catch (err) {
			console.error("Smart Demo analysis failed:", err);
			setAnalysisState("error");
		}
	}, [cursorTelemetry, duration, transcriptSegments]);

	useEffect(() => {
		if (isAutoMode && !autoModeFiredRef.current && cursorTelemetry.length > 0) {
			autoModeFiredRef.current = true;
			runAnalysis();
		}
	}, [isAutoMode, cursorTelemetry, runAnalysis]);

	const handleApply = useCallback(() => {
		onApplyZoomRegions(pendingZoomsRef.current);
		onApplyAnnotations(pendingAnnotationsRef.current);
	}, [onApplyZoomRegions, onApplyAnnotations]);

	const handleApplyTrim = useCallback(() => {
		if (!onApplyTrimRegions || pendingSilencesRef.current.length === 0) return;
		const trimRegions: TrimRegion[] = pendingSilencesRef.current.map((s, i) => ({
			id: `smart-trim-${i + 1}`,
			startMs: s.startMs,
			endMs: s.endMs,
		}));
		onApplyTrimRegions(trimRegions);
	}, [onApplyTrimRegions]);

	const hasTelemetry = cursorTelemetry.length > 0;
	const hasTranscript = transcriptSegments.length > 0;
	const canPolishDemo = hasTelemetry || hasTranscript;

	const selectedTranscriptionOption =
		transcriptionOptions.find((o) => o.id === transcriptionConfig.provider) ?? null;
	const canTranscribe = Boolean(
		videoPath &&
			transcriptionConfig.enabled &&
			selectedTranscriptionOption?.available &&
			transcriptStatus !== "transcribing",
	);

	const transcriptStateLabel =
		transcriptStatus === "transcribing"
			? "Transcribing…"
			: transcriptStatus === "importing"
				? "Importing…"
				: hasTranscript
					? "Ready"
					: "None";

	return (
		<div className="flex flex-col gap-3 px-4 py-3">
			{/* One-Click Polish */}
			<Button
				onClick={onApplyPolishDemo}
				disabled={!canPolishDemo}
				className="w-full gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs h-9 rounded-lg disabled:opacity-40 font-medium"
			>
				<Sparkles size={13} />
				One-Click Polish Demo
			</Button>

			{!hasTelemetry && (
				<p className="text-center text-[11px] text-yellow-300/60">
					Record a new video to enable cursor-based auto-enhance.
				</p>
			)}

			{/* Auto-Enhance */}
			<div className="rounded-lg border border-white/10 bg-black/20 p-3">
				<div className="flex items-center gap-2">
					<span className="text-xs font-medium text-slate-100">Auto-Enhance</span>
					<span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/45">
						{hasTelemetry ? "Cursor data ready" : "No cursor data"}
					</span>
					<Button
						onClick={runAnalysis}
						disabled={!hasTelemetry || analysisState === "processing"}
						variant="ghost"
						className="ml-auto h-7 gap-1.5 px-2 text-[11px] text-white/70 hover:text-white"
					>
						{analysisState === "processing" ? (
							<>
								<RefreshCw size={12} className="animate-spin" />
								Analyzing
							</>
						) : (
							<>
								<Zap size={12} />
								{analysisState === "done" ? "Re-run" : "Generate"}
							</>
						)}
					</Button>
				</div>

				{analysisState === "idle" && (
					<p className="mt-2 text-[11px] text-white/30">
						Generate click-driven zooms, highlights, and silence trims automatically.
					</p>
				)}

				{analysisState === "error" && (
					<p className="mt-2 text-[11px] text-red-300/70">
						Analysis failed — load a video with cursor data and try again.
					</p>
				)}

				{analysisState === "done" && (
					<div className="mt-3 flex flex-col gap-2">
						{/* Summary line */}
						<p className="text-[11px] text-white/45">
							{pendingZoomsRef.current.length} zoom
							{pendingZoomsRef.current.length !== 1 ? "s" : ""} ·{" "}
							{pendingAnnotationsRef.current.length} highlight
							{pendingAnnotationsRef.current.length !== 1 ? "s" : ""}
							{silenceCount > 0
								? ` · ${silenceCount} silence${silenceCount !== 1 ? "s" : ""} detected`
								: ""}
						</p>

						<Button
							onClick={handleApply}
							disabled={
								pendingZoomsRef.current.length === 0 && pendingAnnotationsRef.current.length === 0
							}
							className="w-full gap-2 text-xs h-8 rounded-lg bg-purple-700 hover:bg-purple-600 text-white disabled:opacity-40"
						>
							<Sparkles size={13} />
							Apply Zoom &amp; Highlights
						</Button>

						{silenceCount > 0 && onApplyTrimRegions && (
							<Button
								onClick={handleApplyTrim}
								variant="outline"
								className="w-full gap-2 text-xs h-8 rounded-lg border-amber-700/50 text-amber-300 hover:bg-amber-900/30 bg-transparent disabled:opacity-40"
							>
								<Clock size={13} />
								Trim {silenceCount} Silence{silenceCount !== 1 ? "s" : ""}
							</Button>
						)}

						{steps.length > 0 && (
							<div>
								<button
									type="button"
									onClick={() => setShowSteps((s) => !s)}
									className="flex w-full items-center justify-between rounded-md bg-white/5 px-2.5 py-2 text-[11px] text-white/60 transition hover:bg-white/8"
								>
									<span>
										{steps.length} detected step{steps.length !== 1 ? "s" : ""}
									</span>
									{showSteps ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
								</button>
								{showSteps && (
									<div className="mt-1.5 flex max-h-44 flex-col gap-1 overflow-y-auto pr-1">
										{steps.map((step) => (
											<StepCard
												key={step.number}
												step={step}
												onJump={() => onSeekToTime(step.timestamp)}
											/>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				)}
			</div>

			{/* Transcript */}
			<div className="rounded-lg border border-white/10 bg-black/20 p-3">
				<div className="flex items-center gap-2">
					<span className="text-xs font-medium text-slate-100">Transcript</span>
					<span
						className={`rounded-full px-2 py-0.5 text-[10px] ${
							hasTranscript ? "bg-cyan-900/40 text-cyan-200" : "bg-white/5 text-white/40"
						}`}
					>
						{transcriptStateLabel}
					</span>
					{hasTranscript && (
						<span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/45">
							{transcriptSegments.length} segment
							{transcriptSegments.length !== 1 ? "s" : ""}
						</span>
					)}
				</div>

				<div className="mt-3 space-y-2">
					<Select
						value={transcriptionConfig.provider}
						onValueChange={(value) =>
							void onSaveTranscriptionConfig({
								provider: value as SaveTranscriptionConfigInput["provider"],
								enabled: transcriptionConfig.enabled,
							})
						}
					>
						<SelectTrigger className="h-8 border-white/10 bg-transparent text-xs">
							<SelectValue placeholder="Transcription backend" />
						</SelectTrigger>
						<SelectContent>
							{transcriptionOptions.map((option) => (
								<SelectItem key={option.id} value={option.id} disabled={!option.available}>
									{option.label}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="flex gap-2">
						<Button
							onClick={() => void onImportTranscript()}
							variant="outline"
							className="flex-1 h-8 gap-1.5 border-white/10 bg-transparent text-xs"
							disabled={transcriptStatus === "importing" || transcriptStatus === "transcribing"}
						>
							{transcriptStatus === "importing" ? (
								<RefreshCw size={12} className="animate-spin" />
							) : (
								<FileText size={12} />
							)}
							Import
						</Button>
						<Button
							onClick={() => void onTranscribeAudio()}
							variant="outline"
							className="flex-1 h-8 gap-1.5 border-white/10 bg-transparent text-xs"
							disabled={!canTranscribe}
						>
							{transcriptStatus === "transcribing" ? (
								<RefreshCw size={12} className="animate-spin" />
							) : (
								<FileAudio2 size={12} />
							)}
							Transcribe
						</Button>
					</div>

					{hasTranscript && (
						<div className="flex gap-2">
							<Button
								onClick={onReviewTranscript}
								variant="ghost"
								className="flex-1 h-7 gap-1.5 px-2 text-[11px] text-cyan-200 hover:text-cyan-100"
							>
								<Info size={12} />
								Review
							</Button>
							<Button
								onClick={onClearTranscript}
								variant="ghost"
								className="flex-1 h-7 gap-1.5 px-2 text-[11px] text-white/45 hover:text-white"
							>
								<Trash2 size={12} />
								Clear
							</Button>
						</div>
					)}
				</div>

				{!canTranscribe &&
					videoPath &&
					selectedTranscriptionOption &&
					!selectedTranscriptionOption.available && (
						<p className="mt-2 text-[11px] text-amber-300/70">
							{selectedTranscriptionOption.reason ?? "Backend unavailable"}
						</p>
					)}
				{transcriptError && <p className="mt-2 text-[11px] text-red-300/70">{transcriptError}</p>}

				{/* Caption toggles — shown once transcript is loaded */}
				{hasTranscript && (
					<div className="mt-3 rounded-lg border border-white/8 bg-white/5 px-3 py-2.5">
						<p className="mb-2 text-[11px] font-medium text-white/65">Captions</p>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between">
								<span className="text-[10px] text-white/50">Show in preview</span>
								<Switch
									checked={captionSettings.showInPreview}
									onCheckedChange={(checked) => onCaptionSettingsChange({ showInPreview: checked })}
									className="data-[state=checked]:bg-cyan-600 scale-75"
								/>
							</div>
							<div className="flex items-center justify-between">
								<span className="text-[10px] text-white/50">Burn into export</span>
								<Switch
									checked={captionSettings.burnInDuringExport}
									onCheckedChange={(checked) =>
										onCaptionSettingsChange({ burnInDuringExport: checked })
									}
									className="data-[state=checked]:bg-cyan-600 scale-75"
								/>
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function StepCard({ step, onJump }: { step: DemoStep; onJump?: () => void }) {
	const typeColors: Record<DemoStep["type"], string> = {
		click: "text-blue-400",
		typing: "text-green-400",
		"window-change": "text-orange-400",
		navigation: "text-slate-400",
		silence: "text-slate-500",
	};

	return (
		<button
			type="button"
			onClick={onJump}
			className="flex w-full items-start gap-2 rounded-md bg-white/5 px-2.5 py-2 text-left transition hover:bg-white/8"
		>
			<span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-purple-800/60 text-[9px] font-bold text-purple-200">
				{step.number}
			</span>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline gap-1.5">
					<span className="truncate text-[11px] font-medium text-white/85">{step.title}</span>
					<span className={`ml-auto flex-shrink-0 text-[9px] ${typeColors[step.type]}`}>
						{formatTimestamp(step.timestamp)}
					</span>
				</div>
				<p className="truncate text-[10px] text-white/40">{step.description}</p>
			</div>
		</button>
	);
}
