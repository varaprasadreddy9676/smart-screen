/**
 * SmartDemoPanel.tsx
 * UI panel for the Smart Demo feature in the video editor.
 * Analyses cursor telemetry and auto-generates zoom regions + click highlights.
 */

import {
	isAIConfigReady,
	type PublicAIConfig,
	type PublicTranscriptionConfig,
	type SaveTranscriptionConfigInput,
	type SmartDemoAISuggestion,
	type TranscriptionProviderOption,
	type TranscriptSanityWarning,
	type TranscriptSegment,
} from "@shared/ai";
import {
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Clock,
	Download,
	FileAudio2,
	FileText,
	Info,
	MousePointerClick,
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

interface SmartDemoPanelProps {
	cursorTelemetry: CursorTelemetryPoint[];
	duration: number; // seconds
	isAutoMode?: boolean; // auto-run when telemetry is ready
	videoPath?: string | null;
	aiConfig?: PublicAIConfig | null;
	aiPrompt: string;
	aiSuggestion: SmartDemoAISuggestion | null;
	aiStatus: "idle" | "analyzing" | "error";
	aiError: string | null;
	transcriptSegments: TranscriptSegment[];
	transcriptSourceLabel: string | null;
	transcriptStatus: "idle" | "importing" | "transcribing" | "ready" | "error";
	transcriptError: string | null;
	captionSettings: CaptionSettings;
	transcriptionConfig: PublicTranscriptionConfig;
	transcriptionOptions: TranscriptionProviderOption[];
	nativeClickCaptureStatus: NativeClickCaptureStatus | null;
	usesNativeClickTelemetry: boolean;
	nativeClickTelemetryCount: number;
	transcriptWarnings: TranscriptSanityWarning[];
	localSpeechAnchorCount: number;
	localFocusMomentCount: number;
	onAIPromptChange: (value: string) => void;
	onImportTranscript: () => Promise<void>;
	onTranscribeAudio: () => Promise<void>;
	onSaveTranscriptionConfig: (input: SaveTranscriptionConfigInput) => Promise<void>;
	onCaptionSettingsChange: (settings: Partial<CaptionSettings>) => void;
	onRequestNativeClickCaptureAccess: () => Promise<void>;
	onOpenNativeClickCaptureSettings: () => Promise<void>;
	onClearTranscript: () => void;
	onReviewTranscript: () => void;
	onExportTranscript: (format: "srt" | "vtt") => Promise<void>;
	onRunAIAnalysis: () => Promise<void>;
	onApplyAISuggestion: () => void;
	onApplyAIZooms: () => void;
	onApplyAITrims: () => void;
	onApplyZoomRegions: (regions: ZoomRegion[]) => void;
	onApplyAnnotations: (regions: AnnotationRegion[]) => void;
	onApplyTrimRegions?: (regions: TrimRegion[]) => void;
	onApplyPolishDemo: () => void;
	onSeekToTime: (timeSeconds: number) => void;
}

type ProcessingState = "idle" | "processing" | "done" | "error";
const NATIVE_CLICK_PERMISSION_PROMPT_KEY = "openscreen-native-click-permission-prompted";

export function SmartDemoPanel({
	cursorTelemetry,
	duration,
	isAutoMode = false,
	videoPath,
	aiConfig,
	aiPrompt,
	aiSuggestion,
	aiStatus,
	aiError,
	transcriptSegments,
	transcriptSourceLabel,
	transcriptStatus,
	transcriptError,
	captionSettings,
	transcriptionConfig,
	transcriptionOptions,
	nativeClickCaptureStatus,
	usesNativeClickTelemetry,
	nativeClickTelemetryCount,
	transcriptWarnings,
	localSpeechAnchorCount,
	localFocusMomentCount,
	onAIPromptChange,
	onImportTranscript,
	onTranscribeAudio,
	onSaveTranscriptionConfig,
	onCaptionSettingsChange,
	onRequestNativeClickCaptureAccess,
	onOpenNativeClickCaptureSettings,
	onClearTranscript,
	onReviewTranscript,
	onExportTranscript,
	onRunAIAnalysis,
	onApplyAISuggestion,
	onApplyAIZooms,
	onApplyAITrims,
	onApplyZoomRegions,
	onApplyAnnotations,
	onApplyTrimRegions,
	onApplyPolishDemo,
	onSeekToTime,
}: SmartDemoPanelProps) {
	const [state, setState] = useState<ProcessingState>("idle");
	const [steps, setSteps] = useState<DemoStep[]>([]);
	const [zoomCount, setZoomCount] = useState(0);
	const [clickCount, setClickCount] = useState(0);
	const [silences, setSilences] = useState<SilenceSegment[]>([]);
	const [applied, setApplied] = useState(false);
	const [trimApplied, setTrimApplied] = useState(false);
	const [showLocalSteps, setShowLocalSteps] = useState(false);
	const [showTranscriptPreview, setShowTranscriptPreview] = useState(false);
	const [showAIResultDetails, setShowAIResultDetails] = useState(false);
	const [showAllAISteps, setShowAllAISteps] = useState(false);
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
			const highlights = buildClickHighlights(segments, { transcriptSegments });
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
	}, [cursorTelemetry, duration, transcriptSegments]);

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
		const highlights = buildClickHighlights(segments, { transcriptSegments });

		onApplyZoomRegions(zoomRegions);
		onApplyAnnotations(highlights);
		setApplied(true);
	}, [cursorTelemetry, onApplyZoomRegions, onApplyAnnotations, transcriptSegments]);

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
	const aiConfigured = isAIConfigReady(aiConfig);
	const canRunAI = Boolean(videoPath && aiConfigured && aiStatus !== "analyzing");
	const selectedTranscriptionOption =
		transcriptionOptions.find((option) => option.id === transcriptionConfig.provider) ?? null;
	const canTranscribe = Boolean(
		videoPath &&
			transcriptionConfig.enabled &&
			selectedTranscriptionOption?.available &&
			transcriptStatus !== "transcribing",
	);
	const hasTranscript = transcriptSegments.length > 0;
	const hasUsefulAIInputs = hasTelemetry || hasTranscript;
	const transcriptPreview = transcriptSegments.slice(0, 3);
	const visibleAISteps = showAllAISteps
		? (aiSuggestion?.steps ?? [])
		: (aiSuggestion?.steps ?? []).slice(0, 3);
	const canPolishDemo = hasTelemetry || hasTranscript || aiSuggestion !== null;
	const transcriptStateLabel =
		transcriptStatus === "transcribing"
			? "Transcribing"
			: transcriptStatus === "importing"
				? "Importing"
				: hasTranscript
					? "Ready"
					: "Not added";
	const clickCaptureModeLabel = usesNativeClickTelemetry
		? `Native clicks ${nativeClickTelemetryCount > 0 ? `(${nativeClickTelemetryCount})` : ""}`
		: "Fallback clicks";
	const showFallbackClickBanner = Boolean(
		!usesNativeClickTelemetry &&
			nativeClickCaptureStatus?.supported &&
			nativeClickCaptureStatus.helperAvailable,
	);

	useEffect(() => {
		if (
			!nativeClickCaptureStatus?.supported ||
			!nativeClickCaptureStatus.helperAvailable ||
			nativeClickCaptureStatus.permissionGranted
		) {
			return;
		}

		try {
			if (window.localStorage.getItem(NATIVE_CLICK_PERMISSION_PROMPT_KEY) === "1") {
				return;
			}
			window.localStorage.setItem(NATIVE_CLICK_PERMISSION_PROMPT_KEY, "1");
		} catch {
			// Best effort only; if storage is unavailable the explicit Fix action still works.
		}

		void onRequestNativeClickCaptureAccess();
	}, [nativeClickCaptureStatus, onRequestNativeClickCaptureAccess]);

	return (
		<div className="flex flex-col gap-3 px-4 py-3">
			<div className="flex items-center gap-2">
				<Sparkles size={15} className="text-purple-400 flex-shrink-0" />
				<span className="text-sm font-semibold text-white/90">Smart Demo</span>
				<span className="ml-auto rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/55">
					{clickCaptureModeLabel}
				</span>
			</div>

			{showFallbackClickBanner && (
				<div className="rounded-lg border border-amber-700/30 bg-amber-900/20 px-3 py-2">
					<div className="flex items-center gap-2">
						<MousePointerClick size={12} className="text-amber-200" />
						<p className="text-[11px] text-amber-100/85">
							Using fallback click detection for this recording.
						</p>
						<Button
							onClick={() => void onOpenNativeClickCaptureSettings()}
							variant="ghost"
							className="ml-auto h-7 px-2 text-[11px] text-amber-100 hover:text-white"
						>
							Fix
						</Button>
					</div>
					{nativeClickCaptureStatus?.reason && (
						<p className="mt-1 text-[10px] text-amber-100/60">{nativeClickCaptureStatus.reason}</p>
					)}
				</div>
			)}

			<Button
				onClick={onApplyPolishDemo}
				disabled={!canPolishDemo}
				className="w-full gap-2 bg-emerald-700 hover:bg-emerald-600 text-white text-xs h-8 rounded-lg disabled:opacity-50"
			>
				<Sparkles size={13} />
				One-Click Polish Demo
			</Button>

			{!hasTelemetry && (
				<div className="rounded-lg bg-yellow-900/30 border border-yellow-700/30 px-3 py-2 text-[11px] text-yellow-300/80">
					No cursor telemetry found for this recording. Record a new video to use Smart Demo.
				</div>
			)}

			<div className="rounded-lg border border-white/10 bg-black/20 p-3">
				<div className="flex items-center gap-2">
					<span className="text-xs font-medium text-slate-100">Local Pass</span>
					<span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50">
						{hasTelemetry ? "Telemetry ready" : "Telemetry missing"}
					</span>
					<Button
						onClick={runAnalysis}
						disabled={!hasTelemetry || state === "processing"}
						variant="ghost"
						className="ml-auto h-7 gap-2 px-2 text-[11px] text-white/70 hover:text-white"
					>
						{state === "processing" ? (
							<>
								<RefreshCw size={12} className="animate-spin" />
								Analyzing
							</>
						) : (
							<>
								<Zap size={12} />
								{state === "done" ? "Re-run" : "Generate"}
							</>
						)}
					</Button>
				</div>

				{state === "done" ? (
					<>
						<div className="mt-3 grid grid-cols-3 gap-2">
							<StatBadge
								icon={<MousePointerClick size={11} />}
								label="Clicks"
								value={clickCount}
								color="blue"
							/>
							<StatBadge icon={<Zap size={11} />} label="Zooms" value={zoomCount} color="purple" />
							<StatBadge
								icon={<Clock size={11} />}
								label="Silences"
								value={silences.length}
								color="amber"
							/>
						</div>

						<div className="mt-3 flex flex-col gap-2">
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
						</div>

						{steps.length > 0 && (
							<div className="mt-3">
								<button
									type="button"
									onClick={() => setShowLocalSteps((current) => !current)}
									className="flex w-full items-center justify-between rounded-md bg-white/5 px-2.5 py-2 text-[11px] text-white/65 transition hover:bg-white/8"
								>
									<span>
										{steps.length} detected step{steps.length !== 1 ? "s" : ""}
									</span>
									{showLocalSteps ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
								</button>
								{showLocalSteps && (
									<div className="mt-2 flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
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
					</>
				) : state === "error" ? (
					<div className="mt-3 rounded-lg bg-red-900/30 border border-red-700/30 px-3 py-2 text-[11px] text-red-300/80">
						Analysis failed. Make sure a video with cursor data is loaded.
					</div>
				) : (
					<p className="mt-3 text-[11px] text-white/40">
						Generate a fast local pass for click-driven zooms, highlights, and trim candidates.
					</p>
				)}
			</div>

			<div className="border-t border-white/5 pt-1">
				<div className="rounded-lg border border-white/10 bg-black/20 p-3">
					<div className="flex items-center gap-2">
						<span className="text-xs font-medium text-slate-100">Transcript</span>
						<span className="rounded-full bg-cyan-900/40 px-2 py-0.5 text-[10px] text-cyan-200">
							{transcriptStateLabel}
						</span>
						{hasTranscript && (
							<span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/55">
								{transcriptSegments.length} segment{transcriptSegments.length !== 1 ? "s" : ""}
							</span>
						)}
					</div>

					<div className="mt-3 grid grid-cols-3 gap-2">
						<MiniStateBadge label="Backend" value={selectedTranscriptionOption?.label ?? "Auto"} />
						<MiniStateBadge label="Warnings" value={String(transcriptWarnings.length)} />
						<MiniStateBadge
							label="Speech cues"
							value={`${localSpeechAnchorCount}/${localFocusMomentCount}`}
						/>
					</div>

					<div className="mt-3 flex flex-wrap gap-2">
						<div className="min-w-[180px] flex-1">
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
						</div>
						<Button
							onClick={() => void onImportTranscript()}
							variant="outline"
							className="h-8 gap-2 border-white/10 bg-transparent px-3 text-xs"
							disabled={transcriptStatus === "importing" || transcriptStatus === "transcribing"}
						>
							{transcriptStatus === "importing" ? (
								<RefreshCw size={13} className="animate-spin" />
							) : (
								<FileText size={13} />
							)}
							Import
						</Button>
						<Button
							onClick={() => void onTranscribeAudio()}
							variant="outline"
							className="h-8 gap-2 border-white/10 bg-transparent px-3 text-xs"
							disabled={!canTranscribe}
						>
							{transcriptStatus === "transcribing" ? (
								<RefreshCw size={13} className="animate-spin" />
							) : (
								<FileAudio2 size={13} />
							)}
							Transcribe
						</Button>
						{transcriptSegments.length > 0 && (
							<Button
								onClick={onReviewTranscript}
								variant="ghost"
								className="h-8 gap-2 px-2 text-xs text-cyan-200 hover:text-cyan-100"
							>
								<Info size={13} />
								Review
							</Button>
						)}
					</div>

					<div className="mt-2 flex flex-wrap gap-2">
						{transcriptSegments.length > 0 && (
							<>
								<Button
									onClick={() => void onExportTranscript("srt")}
									variant="ghost"
									className="h-7 gap-2 px-2 text-[11px] text-cyan-200 hover:text-cyan-100"
								>
									<Download size={12} />
									SRT
								</Button>
								<Button
									onClick={() => void onExportTranscript("vtt")}
									variant="ghost"
									className="h-7 gap-2 px-2 text-[11px] text-cyan-200 hover:text-cyan-100"
								>
									<Download size={12} />
									VTT
								</Button>
								<Button
									onClick={onClearTranscript}
									variant="ghost"
									className="h-7 gap-2 px-2 text-[11px] text-white/60 hover:text-white"
								>
									<Trash2 size={12} />
									Clear
								</Button>
							</>
						)}
						{hasTranscript && (
							<button
								type="button"
								onClick={() => setShowTranscriptPreview((current) => !current)}
								className="ml-auto flex items-center gap-1 text-[10px] text-cyan-200/80 hover:text-cyan-100"
							>
								{showTranscriptPreview ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
								Preview
							</button>
						)}
					</div>

					{hasTranscript && (
						<div className="mt-3 rounded-lg border border-white/8 bg-white/5 px-3 py-2">
							<div className="flex items-center justify-between gap-3">
								<div>
									<p className="text-[11px] font-medium text-white/80">Captions</p>
									<p className="text-[10px] text-white/40">
										Show them in preview and optionally burn them into exports.
									</p>
								</div>
								<div className="flex items-center gap-4">
									<div className="flex items-center gap-2">
										<span className="text-[10px] text-white/55">Show</span>
										<Switch
											checked={captionSettings.showInPreview}
											onCheckedChange={(checked) =>
												onCaptionSettingsChange({ showInPreview: checked })
											}
											className="data-[state=checked]:bg-cyan-600 scale-75"
										/>
									</div>
									<div className="flex items-center gap-2">
										<span className="text-[10px] text-white/55">Burn In</span>
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
						</div>
					)}

					{transcriptWarnings.length > 0 && (
						<div className="mt-2 rounded-lg border border-amber-700/30 bg-amber-900/20 px-3 py-2 text-[11px] text-amber-200/85">
							{transcriptWarnings.length} transcript warning
							{transcriptWarnings.length !== 1 ? "s" : ""}. Review before export if timing looks
							off.
						</div>
					)}

					{transcriptSourceLabel && (
						<p className="mt-2 text-[10px] text-white/35">Source: {transcriptSourceLabel}</p>
					)}

					{transcriptError && (
						<div className="mt-2 rounded-lg border border-red-700/30 bg-red-900/20 px-3 py-2 text-[11px] text-red-200/80">
							{transcriptError}
						</div>
					)}

					{showTranscriptPreview && transcriptPreview.length > 0 && (
						<div className="mt-2 flex flex-col gap-1.5">
							{transcriptPreview.map((segment) => (
								<button
									key={segment.id}
									type="button"
									onClick={() => onSeekToTime(segment.startMs / 1000)}
									className="rounded-md bg-white/5 px-2.5 py-2 text-left transition hover:bg-cyan-950/20"
								>
									<div className="flex items-center gap-2">
										<span className="text-[10px] text-cyan-100/60">
											{formatTimestamp(segment.startMs / 1000)}
										</span>
										{segment.speaker && (
											<span className="text-[10px] text-white/35">{segment.speaker}</span>
										)}
									</div>
									<p className="mt-1 text-[11px] text-white/70">{segment.text}</p>
								</button>
							))}
							{transcriptSegments.length > transcriptPreview.length && (
								<p className="text-[10px] text-white/35">
									Showing {transcriptPreview.length} of {transcriptSegments.length}.
								</p>
							)}
						</div>
					)}
				</div>

					<div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
						<div className="flex items-center gap-2">
							<span className="text-xs font-medium text-slate-100">AI Refine</span>
							<span className="rounded-full bg-cyan-900/40 px-2 py-0.5 text-[10px] text-cyan-200">
								{aiConfigured ? "Configured" : "Needs setup"}
							</span>
						</div>

					<div className="mt-3 grid grid-cols-3 gap-2">
						<MiniStateBadge label="Cursor" value={hasTelemetry ? "Ready" : "Missing"} />
						<MiniStateBadge label="Transcript" value={hasTranscript ? "Ready" : "Optional"} />
						<MiniStateBadge label="Frames" value={videoPath ? "Ready" : "Missing"} />
					</div>

					<textarea
						value={aiPrompt}
						onChange={(event) => onAIPromptChange(event.target.value)}
						placeholder="Goal: concise 45-second onboarding demo with clear callouts."
						className="mt-3 min-h-[58px] w-full rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-white outline-none placeholder:text-white/25 focus:border-cyan-500/40"
					/>

					<Button
						onClick={() => void onRunAIAnalysis()}
						disabled={!canRunAI || !hasUsefulAIInputs}
						className="mt-3 w-full gap-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs h-8 rounded-lg disabled:opacity-50"
					>
						{aiStatus === "analyzing" ? (
							<>
								<RefreshCw size={13} className="animate-spin" />
								Analyzing
							</>
						) : (
							<>
								<Sparkles size={13} />
								Refine With AI
							</>
						)}
					</Button>
				</div>

				{aiError && (
					<div className="mt-2 rounded-lg border border-red-700/30 bg-red-900/20 px-3 py-2 text-[11px] text-red-200/80">
						{aiError}
					</div>
				)}

				{aiSuggestion && (
					<div className="mt-3 flex flex-col gap-2 rounded-xl border border-cyan-800/30 bg-cyan-950/10 p-3">
						<div className="flex items-center justify-between gap-2">
							<span className="text-[11px] font-medium text-cyan-200">AI Result</span>
							<button
								type="button"
								onClick={() => setShowAIResultDetails((current) => !current)}
								className="flex items-center gap-1 text-[10px] text-cyan-100/70 hover:text-cyan-100"
							>
								{showAIResultDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
								Details
							</button>
						</div>
						<p className="text-[11px] leading-relaxed text-white/75">{aiSuggestion.summary}</p>
						<div className="grid grid-cols-4 gap-2">
							<MiniStateBadge label="Steps" value={String(aiSuggestion.steps.length)} />
							<MiniStateBadge
								label="Zooms"
								value={String(aiSuggestion.zooms.length + aiSuggestion.narrationLinkedZooms.length)}
							/>
							<MiniStateBadge label="Anchors" value={String(aiSuggestion.speechAnchors.length)} />
							<MiniStateBadge label="Trims" value={String(aiSuggestion.trims.length)} />
						</div>

						<Button
							onClick={onApplyAISuggestion}
							className="w-full gap-2 bg-cyan-700 hover:bg-cyan-600 text-white text-xs h-8 rounded-lg"
						>
							<CheckCircle2 size={13} />
							Apply All AI Suggestions
						</Button>
						<div className="grid grid-cols-2 gap-2">
							<Button
								onClick={onApplyAIZooms}
								variant="outline"
								disabled={
									aiSuggestion.zooms.length + aiSuggestion.narrationLinkedZooms.length === 0
								}
								className="gap-2 border-cyan-800/30 bg-transparent text-xs text-cyan-100 hover:bg-cyan-950/30 disabled:opacity-40"
							>
								<Zap size={12} />
								Apply Zooms
							</Button>
							<Button
								onClick={onApplyAITrims}
								variant="outline"
								disabled={aiSuggestion.trims.length === 0}
								className="gap-2 border-cyan-800/30 bg-transparent text-xs text-cyan-100 hover:bg-cyan-950/30 disabled:opacity-40"
							>
								<Clock size={12} />
								Apply Trims
							</Button>
						</div>

						{showAIResultDetails && (
							<>
								{aiSuggestion.speechAnchors.length > 0 && (
									<div className="rounded-md border border-cyan-800/20 bg-cyan-950/20 px-2.5 py-2">
										<div className="mb-1 flex items-center justify-between gap-2">
											<span className="text-[11px] font-medium text-cyan-100">Speech Anchors</span>
											<span className="text-[10px] text-cyan-100/50">
												{aiSuggestion.focusMoments.length} focus moment
												{aiSuggestion.focusMoments.length !== 1 ? "s" : ""}
											</span>
										</div>
										<div className="flex flex-col gap-1">
											{aiSuggestion.speechAnchors.slice(0, 3).map((anchor) => (
												<button
													key={anchor.id}
													type="button"
													onClick={() => onSeekToTime(anchor.startMs / 1000)}
													className="text-left text-[10px] text-white/65 transition hover:text-cyan-100"
												>
													<span className="text-cyan-100/60">
														{formatTimestamp(anchor.startMs / 1000)}
													</span>{" "}
													{anchor.text}
													{anchor.referencedTarget ? ` -> ${anchor.referencedTarget}` : ""}
												</button>
											))}
										</div>
									</div>
								)}

								{visibleAISteps.length > 0 && (
									<div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
										{visibleAISteps.map((step) => (
											<button
												key={step.id}
												type="button"
												onClick={() => onSeekToTime(step.timestampMs / 1000)}
												className="rounded-md bg-white/5 px-2.5 py-2 text-left transition hover:bg-cyan-950/20"
											>
												<div className="flex items-center gap-2">
													<span className="text-[11px] font-medium text-white/90">
														{step.title}
													</span>
													<span className="ml-auto text-[9px] text-cyan-100/60">
														{formatTimestamp(step.timestampMs / 1000)}
													</span>
												</div>
												<p className="text-[10px] text-white/50">{step.description}</p>
											</button>
										))}
									</div>
								)}

								{aiSuggestion.steps.length > 3 && (
									<button
										type="button"
										onClick={() => setShowAllAISteps((current) => !current)}
										className="self-start text-[10px] text-cyan-100/70 hover:text-cyan-100"
									>
										{showAllAISteps
											? "Show fewer steps"
											: `Show all ${aiSuggestion.steps.length} steps`}
									</button>
								)}
							</>
						)}
					</div>
				)}
			</div>
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
		<div
			className={`flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 ${colorClasses}`}
		>
			<div className="flex items-center gap-1 opacity-70">{icon}</div>
			<span className="text-base font-bold leading-none">{value}</span>
			<span className="text-[9px] opacity-60">{label}</span>
		</div>
	);
}

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
		</button>
	);
}

function MiniStateBadge({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg border border-white/8 bg-white/5 px-2 py-2 text-center">
			<div className="text-[9px] uppercase tracking-wide text-white/35">{label}</div>
			<div className="mt-0.5 text-[11px] font-medium text-white/80">{value}</div>
		</div>
	);
}
