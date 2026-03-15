import {
	isAIConfigReady,
	type PublicAIConfig,
	type PublicTranscriptionConfig,
	type SaveAIConfigInput,
	type SaveTranscriptionConfigInput,
	type SmartDemoAISuggestion,
	type TranscriptionProviderOption,
	type TranscriptSegment,
} from "@shared/ai";
import type { Span } from "dnd-timeline";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import {
	applySmartDemoAISuggestion,
	isAIManagedRegionId,
	mapAISuggestionTrimRegions,
	mapAISuggestionZoomRegions,
} from "@/lib/ai/applySmartDemoAISuggestion";
import { buildSmartDemoAIRequest } from "@/lib/ai/buildSmartDemoAIRequest";
import { analyzeSpeechGrounding } from "@/lib/ai/speechGrounding";
import { parseTranscriptFileContent } from "@/lib/ai/transcriptFormats";
import { getAssetPath } from "@/lib/assetPath";
import {
	calculateOutputDimensions,
	type ExportFormat,
	type ExportProgress,
	type ExportQuality,
	type ExportSettings,
	GIF_SIZE_PRESETS,
	GifExporter,
	type GifFrameRate,
	type GifSizePreset,
	VideoExporter,
} from "@/lib/exporter";
import { matchesShortcut } from "@/lib/shortcuts";
import { buildDemoPolishPlan } from "@/lib/smartDemo/polishDemo";
import {
	type SubtitleFormat,
	serializeTranscriptAsSrt,
	serializeTranscriptAsVtt,
} from "@/lib/subtitles";
import { SmartDemoPanel } from "@/ui/SmartDemoPanel";
import { type AspectRatio, getAspectRatioValue } from "@/utils/aspectRatioUtils";
import { AISettingsDialog } from "./AISettingsDialog";
import { ExportDialog } from "./ExportDialog";
import PlaybackControls from "./PlaybackControls";
import {
	createProjectData,
	deriveNextId,
	fromFileUrl,
	normalizeProjectEditor,
	toFileUrl,
	validateProjectData,
	WALLPAPER_PATHS,
} from "./projectPersistence";
import { SettingsPanel } from "./SettingsPanel";
import { TranscriptReviewDialog } from "./TranscriptReviewDialog";
import TimelineEditor from "./timeline/TimelineEditor";
import {
	type AnnotationRegion,
	type CaptionSettings,
	type CropRegion,
	type CursorClickPulseSettings,
	type CursorTelemetryPoint,
	DEFAULT_KEYSTROKE_OVERLAY_SETTINGS,
	clampFocusToDepth,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_CAPTION_SETTINGS,
	DEFAULT_CROP_REGION,
	DEFAULT_CURSOR_CLICK_PULSE_SETTINGS,
	DEFAULT_FIGURE_DATA,
	DEFAULT_PLAYBACK_SPEED,
	DEFAULT_ZOOM_DEPTH,
	DEFAULT_ZOOM_MOTION_BLUR,
	type FigureData,
	isClickTelemetryPoint,
	type KeystrokeOverlaySettings,
	type KeystrokeTelemetryEvent,
	type PlaybackSpeed,
	type SpeedRegion,
	type TrimRegion,
	type ZoomDepth,
	type ZoomFocus,
	type ZoomRegion,
} from "./types";
import VideoPlayback, { VideoPlaybackRef } from "./VideoPlayback";

export default function VideoEditor() {
	const [videoPath, setVideoPath] = useState<string | null>(null);
	const [videoSourcePath, setVideoSourcePath] = useState<string | null>(null);
	const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [currentTime, setCurrentTime] = useState(0);
	const [duration, setDuration] = useState(0);
	const [wallpaper, setWallpaper] = useState<string>(WALLPAPER_PATHS[0]);
	const [shadowIntensity, setShadowIntensity] = useState(0);
	const [showBlur, setShowBlur] = useState(false);
	const [motionBlurEnabled, setMotionBlurEnabled] = useState(false);
	const [connectZooms, setConnectZooms] = useState(true);
	const [zoomMotionBlur, setZoomMotionBlur] = useState(DEFAULT_ZOOM_MOTION_BLUR);
	const [borderRadius, setBorderRadius] = useState(0);
	const [padding, setPadding] = useState(50);
	const [cropRegion, setCropRegion] = useState<CropRegion>(DEFAULT_CROP_REGION);
	const [zoomRegions, setZoomRegions] = useState<ZoomRegion[]>([]);
	const [cursorTelemetry, setCursorTelemetry] = useState<CursorTelemetryPoint[]>([]);
	const [keystrokeTelemetry, setKeystrokeTelemetry] = useState<KeystrokeTelemetryEvent[]>([]);
	const [smartDemoAutoMode, setSmartDemoAutoMode] = useState(false);
	const [aiConfig, setAIConfig] = useState<PublicAIConfig | null>(null);
	const [aiPrompt, setAIPrompt] = useState("");
	const [aiSuggestion, setAISuggestion] = useState<SmartDemoAISuggestion | null>(null);
	const [aiStatus, setAIStatus] = useState<"idle" | "analyzing" | "error">("idle");
	const [aiError, setAIError] = useState<string | null>(null);
	const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
	const [transcriptSourceLabel, setTranscriptSourceLabel] = useState<string | null>(null);
	const [transcriptStatus, setTranscriptStatus] = useState<
		"idle" | "importing" | "transcribing" | "ready" | "error"
	>("idle");
	const [transcriptError, setTranscriptError] = useState<string | null>(null);
	const [captionSettings, setCaptionSettings] = useState<CaptionSettings>(DEFAULT_CAPTION_SETTINGS);
	const [cursorClickPulseSettings, setCursorClickPulseSettings] = useState<CursorClickPulseSettings>(
		DEFAULT_CURSOR_CLICK_PULSE_SETTINGS,
	);
	const [keystrokeOverlaySettings, setKeystrokeOverlaySettings] = useState<KeystrokeOverlaySettings>(
		DEFAULT_KEYSTROKE_OVERLAY_SETTINGS,
	);
	const [transcriptionConfig, setTranscriptionConfig] = useState<PublicTranscriptionConfig>({
		provider: "auto",
		enabled: true,
	});
	const [transcriptionOptions, setTranscriptionOptions] = useState<TranscriptionProviderOption[]>(
		[],
	);
	const [nativeClickCaptureStatus, setNativeClickCaptureStatus] =
		useState<NativeClickCaptureStatus | null>(null);
	const [showTranscriptReview, setShowTranscriptReview] = useState(false);
	const [showAISettings, setShowAISettings] = useState(false);
	const [isSavingAIConfig, setIsSavingAIConfig] = useState(false);
	const [isTestingAIConnection, setIsTestingAIConnection] = useState(false);
	const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
	const [trimRegions, setTrimRegions] = useState<TrimRegion[]>([]);
	const [selectedTrimId, setSelectedTrimId] = useState<string | null>(null);
	const [speedRegions, setSpeedRegions] = useState<SpeedRegion[]>([]);
	const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
	const [annotationRegions, setAnnotationRegions] = useState<AnnotationRegion[]>([]);
	const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
	const [isExporting, setIsExporting] = useState(false);
	const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
	const [exportError, setExportError] = useState<string | null>(null);
	const [showExportDialog, setShowExportDialog] = useState(false);
	const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
	const [exportQuality, setExportQuality] = useState<ExportQuality>("good");
	const [exportFormat, setExportFormat] = useState<ExportFormat>("mp4");
	const [gifFrameRate, setGifFrameRate] = useState<GifFrameRate>(15);
	const [gifLoop, setGifLoop] = useState(true);
	const [gifSizePreset, setGifSizePreset] = useState<GifSizePreset>("medium");
	const [exportedFilePath, setExportedFilePath] = useState<string | undefined>(undefined);
	const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);

	const videoPlaybackRef = useRef<VideoPlaybackRef>(null);
	const nextZoomIdRef = useRef(1);
	const nextTrimIdRef = useRef(1);
	const nextSpeedIdRef = useRef(1);

	const { shortcuts, isMac } = useShortcuts();
	const nextAnnotationIdRef = useRef(1);
	const nextAnnotationZIndexRef = useRef(1); // Track z-index for stacking order
	const exporterRef = useRef<VideoExporter | null>(null);
	const lastTranscriptVideoSourceRef = useRef<string | null>(null);

	const applyLoadedProject = useCallback(async (candidate: unknown, path?: string | null) => {
		if (!validateProjectData(candidate)) {
			return false;
		}

		const project = candidate;
		const sourcePath = project.videoPath;
		const normalizedEditor = normalizeProjectEditor(project.editor);

		try {
			videoPlaybackRef.current?.pause();
		} catch {
			// no-op
		}
		setIsPlaying(false);
		setCurrentTime(0);
		setDuration(0);

		setError(null);
		setVideoSourcePath(sourcePath);
		setVideoPath(toFileUrl(sourcePath));
		setCurrentProjectPath(path ?? null);

		setWallpaper(normalizedEditor.wallpaper);
		setShadowIntensity(normalizedEditor.shadowIntensity);
		setShowBlur(normalizedEditor.showBlur);
		setMotionBlurEnabled(normalizedEditor.motionBlurEnabled);
		setConnectZooms(normalizedEditor.connectZooms);
		setZoomMotionBlur(normalizedEditor.zoomMotionBlur);
		setBorderRadius(normalizedEditor.borderRadius);
		setPadding(normalizedEditor.padding);
		setCropRegion(normalizedEditor.cropRegion);
		setZoomRegions(normalizedEditor.zoomRegions);
		setTrimRegions(normalizedEditor.trimRegions);
		setSpeedRegions(normalizedEditor.speedRegions);
		setAnnotationRegions(normalizedEditor.annotationRegions);
		setAspectRatio(normalizedEditor.aspectRatio);
		setExportQuality(normalizedEditor.exportQuality);
		setExportFormat(normalizedEditor.exportFormat);
		setGifFrameRate(normalizedEditor.gifFrameRate);
		setGifLoop(normalizedEditor.gifLoop);
		setGifSizePreset(normalizedEditor.gifSizePreset);
		setTranscriptSegments(normalizedEditor.transcriptSegments);
		setCaptionSettings(normalizedEditor.captionSettings);
		setCursorClickPulseSettings(normalizedEditor.cursorClickPulseSettings);
		setKeystrokeOverlaySettings(normalizedEditor.keystrokeOverlaySettings);
		setTranscriptSourceLabel(
			normalizedEditor.transcriptSegments.length > 0 ? "Saved project transcript" : null,
		);
		setTranscriptStatus(normalizedEditor.transcriptSegments.length > 0 ? "ready" : "idle");
		setTranscriptError(null);

		setSelectedZoomId(null);
		setSelectedTrimId(null);
		setSelectedSpeedId(null);
		setSelectedAnnotationId(null);

		nextZoomIdRef.current = deriveNextId(
			"zoom",
			normalizedEditor.zoomRegions.map((region) => region.id),
		);
		nextTrimIdRef.current = deriveNextId(
			"trim",
			normalizedEditor.trimRegions.map((region) => region.id),
		);
		nextSpeedIdRef.current = deriveNextId(
			"speed",
			normalizedEditor.speedRegions.map((region) => region.id),
		);
		nextAnnotationIdRef.current = deriveNextId(
			"annotation",
			normalizedEditor.annotationRegions.map((region) => region.id),
		);
		nextAnnotationZIndexRef.current =
			normalizedEditor.annotationRegions.reduce((max, region) => Math.max(max, region.zIndex), 0) +
			1;

		setLastSavedSnapshot(JSON.stringify(createProjectData(sourcePath, normalizedEditor)));
		return true;
	}, []);

	const currentProjectSnapshot = useMemo(() => {
		const sourcePath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
		if (!sourcePath) {
			return null;
		}
		return JSON.stringify(
			createProjectData(sourcePath, {
				wallpaper,
				shadowIntensity,
				showBlur,
				motionBlurEnabled,
				connectZooms,
				zoomMotionBlur,
				borderRadius,
				padding,
				cropRegion,
				zoomRegions,
				trimRegions,
				speedRegions,
				annotationRegions,
				aspectRatio,
				exportQuality,
				exportFormat,
				gifFrameRate,
				gifLoop,
				gifSizePreset,
				transcriptSegments,
				captionSettings,
				cursorClickPulseSettings,
				keystrokeOverlaySettings,
			}),
		);
	}, [
		videoPath,
		videoSourcePath,
		wallpaper,
		shadowIntensity,
		showBlur,
		motionBlurEnabled,
		connectZooms,
		zoomMotionBlur,
		borderRadius,
		padding,
		cropRegion,
		zoomRegions,
		trimRegions,
		speedRegions,
		annotationRegions,
		aspectRatio,
		exportQuality,
		exportFormat,
		gifFrameRate,
		gifLoop,
		gifSizePreset,
		transcriptSegments,
		captionSettings,
		cursorClickPulseSettings,
		keystrokeOverlaySettings,
	]);

	const hasUnsavedChanges = Boolean(
		currentProjectPath &&
			currentProjectSnapshot &&
			lastSavedSnapshot &&
			currentProjectSnapshot !== lastSavedSnapshot,
	);

	const transcriptAnalysis = useMemo(
		() =>
			analyzeSpeechGrounding({
				transcriptSegments,
				cursorTelemetry,
				durationMs: Math.round(duration * 1000),
			}),
		[transcriptSegments, cursorTelemetry, duration],
	);
	const selectedTranscriptionOption = useMemo(
		() => transcriptionOptions.find((option) => option.id === transcriptionConfig.provider) ?? null,
		[transcriptionConfig.provider, transcriptionOptions],
	);
	const nativeClickTelemetryCount = useMemo(
		() =>
			cursorTelemetry.filter(
				(sample) =>
					isClickTelemetryPoint(sample) && sample.phase === "down" && sample.source === "native",
			).length,
		[cursorTelemetry],
	);
	const usesNativeClickTelemetry = nativeClickTelemetryCount > 0;
	const hasClickTelemetry = useMemo(
		() => cursorTelemetry.some((sample) => isClickTelemetryPoint(sample) && sample.phase === "down"),
		[cursorTelemetry],
	);

	useEffect(() => {
		async function loadInitialData() {
			try {
				const currentProjectResult = await window.electronAPI.loadCurrentProjectFile();
				if (currentProjectResult.success && currentProjectResult.project) {
					const restored = await applyLoadedProject(
						currentProjectResult.project,
						currentProjectResult.path ?? null,
					);
					if (restored) {
						return;
					}
				}

				const result = await window.electronAPI.getCurrentVideoPath();
				if (result.success && result.path) {
					setVideoSourcePath(result.path);
					setVideoPath(toFileUrl(result.path));
					setCurrentProjectPath(null);
					setLastSavedSnapshot(null);
					setTranscriptSegments([]);
					setTranscriptSourceLabel(null);
					setTranscriptStatus("idle");
					setTranscriptError(null);
				} else {
					setError("No video to load. Please record or select a video.");
				}
			} catch (err) {
				setError("Error loading video: " + String(err));
			} finally {
				setLoading(false);
			}
		}

		loadInitialData();

		// Check if we came from a Smart Demo recording
		if (window.electronAPI?.getSmartDemoMode) {
			window.electronAPI
				.getSmartDemoMode()
				.then((result: { value: boolean }) => {
					if (result?.value) {
						setSmartDemoAutoMode(true);
					}
				})
				.catch(() => {});
		}
	}, [applyLoadedProject]);

	const loadAIConfig = useCallback(async () => {
		const result = await window.electronAPI.getAIConfig();
		if (!result.success) {
			setAIConfig(null);
			setAIError(result.error ?? "Failed to load AI configuration.");
			return;
		}

		setAIConfig(result.data ?? null);
		setAIError(null);
	}, []);

	const loadTranscriptionState = useCallback(async () => {
		const [configResult, optionsResult] = await Promise.all([
			window.electronAPI.getTranscriptionConfig(),
			window.electronAPI.listTranscriptionProviders(),
		]);

		if (configResult.success && configResult.data) {
			setTranscriptionConfig(configResult.data);
		}

		if (optionsResult.success && optionsResult.data) {
			setTranscriptionOptions(optionsResult.data);
		}
	}, []);

	const loadNativeClickCaptureStatus = useCallback(async () => {
		const result = await window.electronAPI.getNativeClickCaptureStatus();
		setNativeClickCaptureStatus(result);
	}, []);

	const resetAIInsightState = useCallback(() => {
		setAISuggestion(null);
		setAIStatus("idle");
		setAIError(null);
	}, []);

	const labelFromPath = useCallback((filePath: string) => {
		return filePath.split(/[\\/]/).pop() || filePath;
	}, []);

	useEffect(() => {
		loadAIConfig().catch((error) => {
			setAIConfig(null);
			setAIError(error instanceof Error ? error.message : String(error));
		});
	}, [loadAIConfig]);

	useEffect(() => {
		loadTranscriptionState().catch((error) => {
			console.warn("Failed to load transcription state:", error);
		});
	}, [loadTranscriptionState]);

	useEffect(() => {
		loadNativeClickCaptureStatus().catch((error) => {
			console.warn("Failed to load native click capture status:", error);
		});
	}, [loadNativeClickCaptureStatus]);

	const saveProject = useCallback(
		async (forceSaveAs: boolean) => {
			if (!videoPath) {
				toast.error("No video loaded");
				return;
			}

			const sourcePath = videoSourcePath ?? fromFileUrl(videoPath);
			if (!sourcePath) {
				toast.error("Unable to determine source video path");
				return;
			}

			const projectData = createProjectData(sourcePath, {
				wallpaper,
				shadowIntensity,
				showBlur,
				motionBlurEnabled,
				connectZooms,
				zoomMotionBlur,
				borderRadius,
				padding,
				cropRegion,
				zoomRegions,
				trimRegions,
				speedRegions,
				annotationRegions,
				aspectRatio,
				exportQuality,
				exportFormat,
				gifFrameRate,
				gifLoop,
				gifSizePreset,
				transcriptSegments,
				captionSettings,
				cursorClickPulseSettings,
				keystrokeOverlaySettings,
			});

			const fileNameBase =
				sourcePath
					.split(/[\\/]/)
					.pop()
					?.replace(/\.[^.]+$/, "") || `project-${Date.now()}`;
			const projectSnapshot = JSON.stringify(projectData);
			const result = await window.electronAPI.saveProjectFile(
				projectData,
				fileNameBase,
				forceSaveAs ? undefined : (currentProjectPath ?? undefined),
			);

			if (result.canceled) {
				toast.info("Project save canceled");
				return;
			}

			if (!result.success) {
				toast.error(result.message || "Failed to save project");
				return;
			}

			if (result.path) {
				setCurrentProjectPath(result.path);
			}
			setLastSavedSnapshot(projectSnapshot);

			toast.success(`Project saved to ${result.path}`);
		},
		[
			videoPath,
			videoSourcePath,
			currentProjectPath,
			wallpaper,
			shadowIntensity,
			showBlur,
			motionBlurEnabled,
			connectZooms,
			zoomMotionBlur,
			borderRadius,
			padding,
			cropRegion,
			zoomRegions,
			trimRegions,
			speedRegions,
			annotationRegions,
			aspectRatio,
			exportQuality,
			exportFormat,
			gifFrameRate,
			gifLoop,
			gifSizePreset,
			transcriptSegments,
			captionSettings,
			cursorClickPulseSettings,
			keystrokeOverlaySettings,
		],
	);

	useEffect(() => {
		const handleBeforeUnload = (event: BeforeUnloadEvent) => {
			if (!hasUnsavedChanges) {
				return;
			}

			event.preventDefault();
			event.returnValue = "";
		};

		window.addEventListener("beforeunload", handleBeforeUnload);
		return () => window.removeEventListener("beforeunload", handleBeforeUnload);
	}, [hasUnsavedChanges]);

	const handleSaveProject = useCallback(async () => {
		await saveProject(false);
	}, [saveProject]);

	const handleSaveProjectAs = useCallback(async () => {
		await saveProject(true);
	}, [saveProject]);

	const handleLoadProject = useCallback(async () => {
		const result = await window.electronAPI.loadProjectFile();

		if (result.canceled) {
			return;
		}

		if (!result.success) {
			toast.error(result.message || "Failed to load project");
			return;
		}

		const restored = await applyLoadedProject(result.project, result.path ?? null);
		if (!restored) {
			toast.error("Invalid project file format");
			return;
		}

		toast.success(`Project loaded from ${result.path}`);
	}, [applyLoadedProject]);

	useEffect(() => {
		const removeLoadListener = window.electronAPI.onMenuLoadProject(handleLoadProject);
		const removeSaveListener = window.electronAPI.onMenuSaveProject(handleSaveProject);
		const removeSaveAsListener = window.electronAPI.onMenuSaveProjectAs(handleSaveProjectAs);

		return () => {
			removeLoadListener?.();
			removeSaveListener?.();
			removeSaveAsListener?.();
		};
	}, [handleLoadProject, handleSaveProject, handleSaveProjectAs]);

	useEffect(() => {
		let mounted = true;

		async function loadCursorTelemetry() {
			if (!videoPath) {
				if (mounted) {
					setCursorTelemetry([]);
				}
				return;
			}

			try {
				const result = await window.electronAPI.getCursorTelemetry(fromFileUrl(videoPath));
				if (mounted) {
					setCursorTelemetry(result.success ? result.samples : []);
				}
			} catch (telemetryError) {
				console.warn("Unable to load cursor telemetry:", telemetryError);
				if (mounted) {
					setCursorTelemetry([]);
				}
			}
		}

		loadCursorTelemetry();

		return () => {
			mounted = false;
		};
	}, [videoPath]);

	useEffect(() => {
		let mounted = true;

		async function loadKeystrokeTelemetry() {
			if (!videoPath) {
				if (mounted) {
					setKeystrokeTelemetry([]);
				}
				return;
			}

			try {
				const result = await window.electronAPI.getKeystrokeTelemetry(fromFileUrl(videoPath));
				if (mounted) {
					setKeystrokeTelemetry(result.success ? result.events : []);
				}
			} catch (telemetryError) {
				console.warn("Unable to load keystroke telemetry:", telemetryError);
				if (mounted) {
					setKeystrokeTelemetry([]);
				}
			}
		}

		loadKeystrokeTelemetry();

		return () => {
			mounted = false;
		};
	}, [videoPath]);

	useEffect(() => {
		resetAIInsightState();
	}, [videoPath, resetAIInsightState]);

	useEffect(() => {
		if (!videoSourcePath) {
			lastTranscriptVideoSourceRef.current = null;
			return;
		}

		if (
			currentProjectPath === null &&
			lastTranscriptVideoSourceRef.current &&
			lastTranscriptVideoSourceRef.current !== videoSourcePath
		) {
			setTranscriptSegments([]);
			setTranscriptSourceLabel(null);
			setTranscriptStatus("idle");
			setTranscriptError(null);
		}

		lastTranscriptVideoSourceRef.current = videoSourcePath;
	}, [currentProjectPath, videoSourcePath]);

	// Initialize default wallpaper with resolved asset path
	useEffect(() => {
		let mounted = true;
		(async () => {
			try {
				const resolvedPath = await getAssetPath("wallpapers/wallpaper1.jpg");
				if (mounted) {
					setWallpaper(resolvedPath);
				}
			} catch (err) {
				// If resolution fails, keep the fallback
				console.warn("Failed to resolve default wallpaper path:", err);
			}
		})();
		return () => {
			mounted = false;
		};
	}, []);

	function togglePlayPause() {
		const playback = videoPlaybackRef.current;
		const video = playback?.video;
		if (!playback || !video) return;

		if (isPlaying) {
			playback.pause();
		} else {
			playback.play().catch((err) => console.error("Video play failed:", err));
		}
	}

	const handleSeek = useCallback((time: number) => {
		const video = videoPlaybackRef.current?.video;
		if (!video) return;
		video.currentTime = time;
	}, []);

	const previewAppliedZoomRegions = useCallback(
		(regions: ZoomRegion[]) => {
			if (regions.length === 0) {
				setSelectedZoomId(null);
				return;
			}

			const firstRegion = [...regions].sort((left, right) => left.startMs - right.startMs)[0]!;
			const previewMs = Math.min(firstRegion.endMs - 50, firstRegion.startMs + 350);
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
			handleSeek(Math.max(0, previewMs) / 1000);
		},
		[handleSeek],
	);

	const handleSelectZoom = useCallback((id: string | null) => {
		setSelectedZoomId(id);
		if (id) setSelectedTrimId(null);
	}, []);

	const handleSelectTrim = useCallback((id: string | null) => {
		setSelectedTrimId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedAnnotationId(null);
		}
	}, []);

	const handleSelectAnnotation = useCallback((id: string | null) => {
		setSelectedAnnotationId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
		}
	}, []);

	const handleZoomAdded = useCallback((span: Span) => {
		const id = `zoom-${nextZoomIdRef.current++}`;
		const newRegion: ZoomRegion = {
			id,
			startMs: Math.round(span.start),
			endMs: Math.round(span.end),
			depth: DEFAULT_ZOOM_DEPTH,
			focus: { cx: 0.5, cy: 0.5 },
		};
		setZoomRegions((prev) => [...prev, newRegion]);
		setSelectedZoomId(id);
		setSelectedTrimId(null);
		setSelectedAnnotationId(null);
	}, []);

	const handleZoomSuggested = useCallback((span: Span, focus: ZoomFocus) => {
		const id = `zoom-${nextZoomIdRef.current++}`;
		const newRegion: ZoomRegion = {
			id,
			startMs: Math.round(span.start),
			endMs: Math.round(span.end),
			depth: DEFAULT_ZOOM_DEPTH,
			focus: clampFocusToDepth(focus, DEFAULT_ZOOM_DEPTH),
		};
		setZoomRegions((prev) => [...prev, newRegion]);
		setSelectedZoomId(id);
		setSelectedTrimId(null);
		setSelectedAnnotationId(null);
	}, []);

	const handleTrimAdded = useCallback((span: Span) => {
		const id = `trim-${nextTrimIdRef.current++}`;
		const newRegion: TrimRegion = {
			id,
			startMs: Math.round(span.start),
			endMs: Math.round(span.end),
		};
		setTrimRegions((prev) => [...prev, newRegion]);
		setSelectedTrimId(id);
		setSelectedZoomId(null);
		setSelectedAnnotationId(null);
	}, []);

	const handleZoomSpanChange = useCallback((id: string, span: Span) => {
		setZoomRegions((prev) =>
			prev.map((region) =>
				region.id === id
					? {
							...region,
							startMs: Math.round(span.start),
							endMs: Math.round(span.end),
						}
					: region,
			),
		);
	}, []);

	const handleTrimSpanChange = useCallback((id: string, span: Span) => {
		setTrimRegions((prev) =>
			prev.map((region) =>
				region.id === id
					? {
							...region,
							startMs: Math.round(span.start),
							endMs: Math.round(span.end),
						}
					: region,
			),
		);
	}, []);

	const handleZoomFocusChange = useCallback((id: string, focus: ZoomFocus) => {
		setZoomRegions((prev) =>
			prev.map((region) =>
				region.id === id
					? {
							...region,
							focus: clampFocusToDepth(focus, region.depth),
						}
					: region,
			),
		);
	}, []);

	const handleZoomDepthChange = useCallback(
		(depth: ZoomDepth) => {
			if (!selectedZoomId) return;
			setZoomRegions((prev) =>
				prev.map((region) =>
					region.id === selectedZoomId
						? {
								...region,
								depth,
								focus: clampFocusToDepth(region.focus, depth),
							}
						: region,
				),
			);
		},
		[selectedZoomId],
	);

	const handleZoomDelete = useCallback(
		(id: string) => {
			setZoomRegions((prev) => prev.filter((region) => region.id !== id));
			if (selectedZoomId === id) {
				setSelectedZoomId(null);
			}
		},
		[selectedZoomId],
	);

	const handleTrimDelete = useCallback(
		(id: string) => {
			setTrimRegions((prev) => prev.filter((region) => region.id !== id));
			if (selectedTrimId === id) {
				setSelectedTrimId(null);
			}
		},
		[selectedTrimId],
	);

	const handleSelectSpeed = useCallback((id: string | null) => {
		setSelectedSpeedId(id);
		if (id) {
			setSelectedZoomId(null);
			setSelectedTrimId(null);
			setSelectedAnnotationId(null);
		}
	}, []);

	const handleSpeedAdded = useCallback((span: Span) => {
		const id = `speed-${nextSpeedIdRef.current++}`;
		const newRegion: SpeedRegion = {
			id,
			startMs: Math.round(span.start),
			endMs: Math.round(span.end),
			speed: DEFAULT_PLAYBACK_SPEED,
		};
		setSpeedRegions((prev) => [...prev, newRegion]);
		setSelectedSpeedId(id);
		setSelectedZoomId(null);
		setSelectedTrimId(null);
		setSelectedAnnotationId(null);
	}, []);

	const handleSpeedSpanChange = useCallback((id: string, span: Span) => {
		setSpeedRegions((prev) =>
			prev.map((region) =>
				region.id === id
					? {
							...region,
							startMs: Math.round(span.start),
							endMs: Math.round(span.end),
						}
					: region,
			),
		);
	}, []);

	const handleSpeedDelete = useCallback(
		(id: string) => {
			setSpeedRegions((prev) => prev.filter((region) => region.id !== id));
			if (selectedSpeedId === id) {
				setSelectedSpeedId(null);
			}
		},
		[selectedSpeedId],
	);

	const handleSpeedChange = useCallback(
		(speed: PlaybackSpeed) => {
			if (!selectedSpeedId) return;
			setSpeedRegions((prev) =>
				prev.map((region) => (region.id === selectedSpeedId ? { ...region, speed } : region)),
			);
		},
		[selectedSpeedId],
	);

	const handleAnnotationAdded = useCallback((span: Span) => {
		const id = `annotation-${nextAnnotationIdRef.current++}`;
		const zIndex = nextAnnotationZIndexRef.current++; // Assign z-index based on creation order
		const newRegion: AnnotationRegion = {
			id,
			startMs: Math.round(span.start),
			endMs: Math.round(span.end),
			type: "text",
			content: "Enter text...",
			position: { ...DEFAULT_ANNOTATION_POSITION },
			size: { ...DEFAULT_ANNOTATION_SIZE },
			style: { ...DEFAULT_ANNOTATION_STYLE },
			zIndex,
		};
		setAnnotationRegions((prev) => [...prev, newRegion]);
		setSelectedAnnotationId(id);
		setSelectedZoomId(null);
		setSelectedTrimId(null);
	}, []);

	const handleAnnotationSpanChange = useCallback((id: string, span: Span) => {
		setAnnotationRegions((prev) =>
			prev.map((region) =>
				region.id === id
					? {
							...region,
							startMs: Math.round(span.start),
							endMs: Math.round(span.end),
						}
					: region,
			),
		);
	}, []);

	const handleAnnotationDelete = useCallback(
		(id: string) => {
			setAnnotationRegions((prev) => prev.filter((region) => region.id !== id));
			if (selectedAnnotationId === id) {
				setSelectedAnnotationId(null);
			}
		},
		[selectedAnnotationId],
	);

	const handleAnnotationContentChange = useCallback((id: string, content: string) => {
		setAnnotationRegions((prev) => {
			const updated = prev.map((region) => {
				if (region.id !== id) return region;

				// Store content in type-specific fields
				if (region.type === "text") {
					return { ...region, content, textContent: content };
				} else if (region.type === "image") {
					return { ...region, content, imageContent: content };
				} else {
					return { ...region, content };
				}
			});
			return updated;
		});
	}, []);

	const handleAnnotationTypeChange = useCallback((id: string, type: AnnotationRegion["type"]) => {
		setAnnotationRegions((prev) => {
			const updated = prev.map((region) => {
				if (region.id !== id) return region;

				const updatedRegion = { ...region, type };

				// Restore content from type-specific storage
				if (type === "text") {
					updatedRegion.content = region.textContent || "Enter text...";
				} else if (type === "image") {
					updatedRegion.content = region.imageContent || "";
				} else if (type === "figure") {
					updatedRegion.content = "";
					if (!region.figureData) {
						updatedRegion.figureData = { ...DEFAULT_FIGURE_DATA };
					}
				}

				return updatedRegion;
			});
			return updated;
		});
	}, []);

	const handleAnnotationStyleChange = useCallback(
		(id: string, style: Partial<AnnotationRegion["style"]>) => {
			setAnnotationRegions((prev) =>
				prev.map((region) =>
					region.id === id ? { ...region, style: { ...region.style, ...style } } : region,
				),
			);
		},
		[],
	);

	const handleAnnotationFigureDataChange = useCallback((id: string, figureData: FigureData) => {
		setAnnotationRegions((prev) =>
			prev.map((region) => (region.id === id ? { ...region, figureData } : region)),
		);
	}, []);

	const handleAnnotationPositionChange = useCallback(
		(id: string, position: { x: number; y: number }) => {
			setAnnotationRegions((prev) =>
				prev.map((region) => (region.id === id ? { ...region, position } : region)),
			);
		},
		[],
	);

	const handleAnnotationSizeChange = useCallback(
		(id: string, size: { width: number; height: number }) => {
			setAnnotationRegions((prev) =>
				prev.map((region) => (region.id === id ? { ...region, size } : region)),
			);
		},
		[],
	);

	const handleSmartDemoApplyZoom = useCallback(
		(regions: ZoomRegion[]) => {
			// Clear existing smart zoom regions and add new ones
			setZoomRegions((prev) => [
				...prev.filter((r) => !r.id.startsWith("smart-zoom-")),
				...regions,
			]);
			previewAppliedZoomRegions(regions);
			toast.success(
				`Applied ${regions.length} smart zoom region${regions.length !== 1 ? "s" : ""}`,
			);
		},
		[previewAppliedZoomRegions],
	);

	const handleSmartDemoApplyAnnotations = useCallback((regions: AnnotationRegion[]) => {
		setAnnotationRegions((prev) => [
			...prev.filter((r) => !r.id.startsWith("smart-click-")),
			...regions,
		]);
	}, []);

	const handleSmartDemoApplyTrim = useCallback((regions: TrimRegion[]) => {
		setTrimRegions((prev) => [...prev.filter((r) => !r.id.startsWith("smart-trim-")), ...regions]);
		toast.success(
			`Added ${regions.length} trim region${regions.length !== 1 ? "s" : ""} for silence removal`,
		);
	}, []);

	const handleImportTranscript = useCallback(async () => {
		setTranscriptStatus("importing");
		setTranscriptError(null);

		try {
			const result = await window.electronAPI.openTranscriptFilePicker();
			if (result.canceled) {
				setTranscriptStatus(transcriptSegments.length > 0 ? "ready" : "idle");
				return;
			}

			if (!result.success || !result.data) {
				throw new Error(result.error ?? "Failed to import transcript.");
			}

			const parsedTranscript = parseTranscriptFileContent(result.data.content, result.data.name);
			setTranscriptSegments(parsedTranscript);
			setCaptionSettings((current) => ({ ...current, showInPreview: parsedTranscript.length > 0 }));
			setTranscriptSourceLabel(result.data.name);
			setTranscriptStatus("ready");
			resetAIInsightState();
			toast.success(`Imported ${parsedTranscript.length} transcript segments`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setTranscriptStatus("error");
			setTranscriptError(message);
			toast.error(message);
		}
	}, [resetAIInsightState, transcriptSegments.length]);

	const handleTranscribeAudio = useCallback(async () => {
		if (!transcriptionConfig.enabled) {
			const message = "Transcription is disabled. Enable a transcription backend first.";
			setTranscriptStatus("error");
			setTranscriptError(message);
			toast.error(message);
			return;
		}

		if (selectedTranscriptionOption && !selectedTranscriptionOption.available) {
			const message =
				selectedTranscriptionOption.reason ?? "The selected transcription backend is unavailable.";
			setTranscriptStatus("error");
			setTranscriptError(message);
			toast.error(message);
			return;
		}

		const sourcePath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
		if (!sourcePath) {
			const message = "No source video is available for transcription.";
			setTranscriptStatus("error");
			setTranscriptError(message);
			toast.error(message);
			return;
		}

		setTranscriptStatus("transcribing");
		setTranscriptError(null);

		try {
			const result = await window.electronAPI.transcribeVideoAudio({
				videoPath: sourcePath,
				provider: transcriptionConfig.provider,
			});
			if (!result.success || !result.data) {
				throw new Error(result.error ?? "Audio transcription failed.");
			}

			const segments = result.data;
			setTranscriptSegments(segments);
			setCaptionSettings((current) => ({ ...current, showInPreview: segments.length > 0 }));
			const providerLabel = selectedTranscriptionOption?.label ?? "Auto";
			setTranscriptSourceLabel(`${labelFromPath(sourcePath)} (${providerLabel} transcription)`);
			setTranscriptStatus("ready");
			resetAIInsightState();
			toast.success(`Transcribed ${segments.length} transcript segments`);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setTranscriptStatus("error");
			setTranscriptError(message);
			toast.error(message);
		}
	}, [
		labelFromPath,
		resetAIInsightState,
		selectedTranscriptionOption,
		transcriptionConfig,
		videoPath,
		videoSourcePath,
	]);

	const handleClearTranscript = useCallback(() => {
		setTranscriptSegments([]);
		setTranscriptSourceLabel(null);
		setTranscriptStatus("idle");
		setTranscriptError(null);
		resetAIInsightState();
		toast.success("Transcript cleared");
	}, [resetAIInsightState]);

	const handleExportTranscript = useCallback(
		async (format: SubtitleFormat) => {
			if (transcriptSegments.length === 0) {
				toast.error("No transcript segments available to export.");
				return;
			}

			const sourcePath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
			const fileStem =
				sourcePath
					?.split(/[\\/]/)
					.pop()
					?.replace(/\.[^.]+$/, "") ?? `transcript-${Date.now()}`;
			const fileName = `${fileStem}.${format}`;
			const contents =
				format === "srt"
					? serializeTranscriptAsSrt(transcriptSegments)
					: serializeTranscriptAsVtt(transcriptSegments);

			const result = await window.electronAPI.saveExportedText(contents, fileName);
			if (result.canceled) {
				return;
			}
			if (!result.success) {
				toast.error(result.message || `Failed to save ${format.toUpperCase()} export`);
				return;
			}

			toast.success(`${format.toUpperCase()} exported${result.path ? ` to ${result.path}` : ""}`);
		},
		[transcriptSegments, videoPath, videoSourcePath],
	);

	const handleCaptionSettingsChange = useCallback((partial: Partial<CaptionSettings>) => {
		setCaptionSettings((current) => ({ ...current, ...partial }));
	}, []);

	const handleCursorClickPulseSettingsChange = useCallback(
		(partial: Partial<CursorClickPulseSettings>) => {
			setCursorClickPulseSettings((current) => ({ ...current, ...partial }));
		},
		[],
	);

	const handleKeystrokeOverlaySettingsChange = useCallback(
		(partial: Partial<KeystrokeOverlaySettings>) => {
			setKeystrokeOverlaySettings((current) => ({ ...current, ...partial }));
		},
		[],
	);

	const handlePolishDemo = useCallback(() => {
		const plan = buildDemoPolishPlan({
			cursorTelemetry,
			durationMs: Math.round(duration * 1000),
			aiSuggestion,
			transcriptSegments,
			captionSettings,
		});

		setZoomRegions((prev) => [
			...prev.filter(
				(region) => !region.id.startsWith("smart-zoom-") && !isAIManagedRegionId(region.id),
			),
			...plan.zoomRegions,
		]);
		setTrimRegions((prev) => [
			...prev.filter(
				(region) => !region.id.startsWith("smart-trim-") && !isAIManagedRegionId(region.id),
			),
			...plan.trimRegions,
		]);
		setAnnotationRegions((prev) => [
			...prev.filter((region) => !region.id.startsWith("smart-click-")),
			...plan.annotationRegions,
		]);
		setCaptionSettings(plan.captionSettings);
		previewAppliedZoomRegions(plan.zoomRegions);

		const parts = [
			plan.zoomSource === "ai"
				? "AI-guided zooms"
				: plan.zoomSource === "local"
					? "smart zooms"
					: null,
			plan.trimSource === "ai" ? "AI trims" : plan.trimSource === "local" ? "silence trims" : null,
			transcriptSegments.length > 0 ? "captions ready for preview/export" : null,
		].filter(Boolean);

		toast.success(
			parts.length > 0 ? `Polished demo: ${parts.join(", ")}` : "Polished current demo settings",
		);
	}, [
		cursorTelemetry,
		duration,
		aiSuggestion,
		transcriptSegments,
		captionSettings,
		previewAppliedZoomRegions,
	]);

	const handleSaveTranscriptionConfig = useCallback(
		async (input: SaveTranscriptionConfigInput) => {
			const result = await window.electronAPI.saveTranscriptionConfig(input);
			if (!result.success || !result.data) {
				const message = result.error ?? "Failed to save transcription settings.";
				setTranscriptError(message);
				toast.error(message);
				return;
			}

			setTranscriptionConfig(result.data);
			await loadTranscriptionState();
		},
		[loadTranscriptionState],
	);

	const handleRequestNativeClickCaptureAccess = useCallback(async () => {
		const status = await window.electronAPI.requestNativeClickCaptureAccess();
		setNativeClickCaptureStatus(status);
		if (status.permissionGranted) {
			toast.success("Native click capture is ready.");
			return;
		}

		toast.info(
			status.reason ?? "Grant Accessibility access to enable precise native click capture.",
		);
	}, []);

	const handleOpenNativeClickCaptureSettings = useCallback(async () => {
		const result = await window.electronAPI.openNativeClickCaptureSettings();
		if (!result.success) {
			toast.error(result.error ?? "Unable to open Accessibility settings.");
			return;
		}

		toast.info("OpenScreen needs Accessibility access for precise native click capture.");
	}, []);

	const handleSaveTranscriptEdits = useCallback(
		(segments: TranscriptSegment[]) => {
			setTranscriptSegments(segments);
			setCaptionSettings((current) => ({
				...current,
				showInPreview: segments.length > 0 ? current.showInPreview : false,
			}));
			setTranscriptSourceLabel((current) =>
				current
					? current.endsWith("(edited)")
						? current
						: `${current} (edited)`
					: "Edited transcript",
			);
			setTranscriptStatus(segments.length > 0 ? "ready" : "idle");
			setTranscriptError(null);
			resetAIInsightState();
			toast.success("Transcript edits saved");
		},
		[resetAIInsightState],
	);

	const handleSaveAIConfig = useCallback(
		async (input: SaveAIConfigInput) => {
			setIsSavingAIConfig(true);
			setAIError(null);

			try {
				const result = await window.electronAPI.saveAIConfig(input);
				if (!result.success || !result.data) {
					throw new Error(result.error ?? "Failed to save AI configuration.");
				}

				setAIConfig(result.data);
				await loadTranscriptionState();
				setShowAISettings(false);
				toast.success("AI configuration saved");
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setAIError(message);
				toast.error(message);
			} finally {
				setIsSavingAIConfig(false);
			}
		},
		[loadTranscriptionState],
	);

	const handleClearAIConfig = useCallback(async () => {
		setAIError(null);

		const result = await window.electronAPI.clearAIConfig();
		if (!result.success) {
			const message = result.error ?? "Failed to clear AI configuration.";
			setAIError(message);
			toast.error(message);
			return;
		}

		setAIConfig(null);
		setAISuggestion(null);
		await loadTranscriptionState();
		toast.success("AI configuration cleared");
	}, [loadTranscriptionState]);

	const handleTestAIConnection = useCallback(async () => {
		setIsTestingAIConnection(true);
		setAIError(null);

		try {
			const result = await window.electronAPI.testAIConnection();
			if (!result.success) {
				throw new Error(result.error ?? "AI connection test failed.");
			}

			toast.success("AI connection succeeded");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setAIError(message);
			toast.error(message);
		} finally {
			setIsTestingAIConnection(false);
		}
	}, []);

	const handleRunAIAnalysis = useCallback(async () => {
		if (!isAIConfigReady(aiConfig)) {
			const message = "Configure AI settings before running AI analysis.";
			setAIStatus("error");
			setAIError(message);
			toast.error(message);
			return;
		}

		const videoElement = videoPlaybackRef.current?.video;
		if (!videoElement) {
			const message = "Video is not ready for AI analysis.";
			setAIStatus("error");
			setAIError(message);
			toast.error(message);
			return;
		}

		try {
			setAIStatus("analyzing");
			setAIError(null);

			const currentAIConfig = aiConfig;
			if (!currentAIConfig) {
				throw new Error("AI configuration is missing.");
			}

			const durationMs = Math.round((duration || videoElement.duration || 0) * 1000);
			const request = await buildSmartDemoAIRequest({
				config: currentAIConfig,
				cursorTelemetry,
				durationMs,
				userPrompt: aiPrompt,
				transcriptSegments,
				videoElement,
			});

			const result = await window.electronAPI.runSmartDemoAIAnalysis(request);
			if (!result.success || !result.data) {
				throw new Error(result.error ?? "AI analysis failed.");
			}

			setAISuggestion(result.data);
			setAIStatus("idle");
			toast.success("AI Smart Demo suggestions generated");
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setAIStatus("error");
			setAIError(message);
			toast.error(message);
		}
	}, [aiConfig, aiPrompt, cursorTelemetry, duration, transcriptSegments]);

	const handleApplyAISuggestion = useCallback(() => {
		if (!aiSuggestion) {
			return;
		}

		const mapped = applySmartDemoAISuggestion(aiSuggestion);
		setZoomRegions((prev) => [
			...prev.filter((region) => !isAIManagedRegionId(region.id)),
			...mapped.zoomRegions,
		]);
		setTrimRegions((prev) => [
			...prev.filter((region) => !isAIManagedRegionId(region.id)),
			...mapped.trimRegions,
		]);
		previewAppliedZoomRegions(mapped.zoomRegions);
		toast.success("Applied AI Smart Demo suggestions");
	}, [aiSuggestion, previewAppliedZoomRegions]);

	const handleApplyAIZooms = useCallback(() => {
		if (!aiSuggestion) {
			return;
		}

		const zoomRegions = mapAISuggestionZoomRegions(aiSuggestion);
		setZoomRegions((prev) => [
			...prev.filter((region) => !isAIManagedRegionId(region.id)),
			...zoomRegions,
		]);
		previewAppliedZoomRegions(zoomRegions);
		toast.success(
			zoomRegions.length > 0
				? `Applied ${zoomRegions.length} AI zoom suggestion${zoomRegions.length === 1 ? "" : "s"}`
				: "Removed AI zoom suggestions",
		);
	}, [aiSuggestion, previewAppliedZoomRegions]);

	const handleApplyAITrims = useCallback(() => {
		if (!aiSuggestion) {
			return;
		}

		const trimRegions = mapAISuggestionTrimRegions(aiSuggestion);
		setTrimRegions((prev) => [
			...prev.filter((region) => !isAIManagedRegionId(region.id)),
			...trimRegions,
		]);
		toast.success(
			trimRegions.length > 0
				? `Applied ${trimRegions.length} AI trim suggestion${trimRegions.length === 1 ? "" : "s"}`
				: "Removed AI trim suggestions",
		);
	}, [aiSuggestion]);

	// Global Tab prevention
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Tab") {
				// Allow tab only in inputs/textareas
				if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
					return;
				}
				e.preventDefault();
			}

			if (matchesShortcut(e, shortcuts.playPause, isMac)) {
				// Allow space only in inputs/textareas
				if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
					return;
				}
				e.preventDefault();

				const playback = videoPlaybackRef.current;
				if (playback?.video) {
					if (playback.video.paused) {
						playback.play().catch(console.error);
					} else {
						playback.pause();
					}
				}
			}
		};

		window.addEventListener("keydown", handleKeyDown, { capture: true });
		return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
	}, [shortcuts, isMac]);

	useEffect(() => {
		if (selectedZoomId && !zoomRegions.some((region) => region.id === selectedZoomId)) {
			setSelectedZoomId(null);
		}
	}, [selectedZoomId, zoomRegions]);

	useEffect(() => {
		if (selectedTrimId && !trimRegions.some((region) => region.id === selectedTrimId)) {
			setSelectedTrimId(null);
		}
	}, [selectedTrimId, trimRegions]);

	useEffect(() => {
		if (
			selectedAnnotationId &&
			!annotationRegions.some((region) => region.id === selectedAnnotationId)
		) {
			setSelectedAnnotationId(null);
		}
	}, [selectedAnnotationId, annotationRegions]);

	useEffect(() => {
		if (selectedSpeedId && !speedRegions.some((region) => region.id === selectedSpeedId)) {
			setSelectedSpeedId(null);
		}
	}, [selectedSpeedId, speedRegions]);

	const handleExport = useCallback(
		async (settings: ExportSettings) => {
			if (!videoPath) {
				toast.error("No video loaded");
				return;
			}

			const video = videoPlaybackRef.current?.video;
			if (!video) {
				toast.error("Video not ready");
				return;
			}

			setIsExporting(true);
			setExportProgress(null);
			setExportError(null);

			try {
				const wasPlaying = isPlaying;
				if (wasPlaying) {
					videoPlaybackRef.current?.pause();
				}

				const aspectRatioValue = getAspectRatioValue(aspectRatio);
				const sourceWidth = video.videoWidth || 1920;
				const sourceHeight = video.videoHeight || 1080;

				// Get preview CONTAINER dimensions for scaling
				const playbackRef = videoPlaybackRef.current;
				const containerElement = playbackRef?.containerRef?.current;
				const previewWidth = containerElement?.clientWidth || 1920;
				const previewHeight = containerElement?.clientHeight || 1080;

				if (settings.format === "gif" && settings.gifConfig) {
					// GIF Export
					const gifExporter = new GifExporter({
						videoUrl: videoPath,
						width: settings.gifConfig.width,
						height: settings.gifConfig.height,
						frameRate: settings.gifConfig.frameRate,
						loop: settings.gifConfig.loop,
						sizePreset: settings.gifConfig.sizePreset,
						wallpaper,
						zoomRegions,
						trimRegions,
						speedRegions,
						showShadow: shadowIntensity > 0,
						shadowIntensity,
						showBlur,
						motionBlurEnabled,
						zoomMotionBlur,
						connectZooms,
						borderRadius,
						padding,
						videoPadding: padding,
						cropRegion,
						annotationRegions,
						transcriptSegments,
						captionSettings,
						cursorTelemetry,
						cursorClickPulseSettings,
						keystrokeTelemetry,
						keystrokeOverlaySettings,
						previewWidth,
						previewHeight,
						onProgress: (progress: ExportProgress) => {
							setExportProgress(progress);
						},
					});

					exporterRef.current = gifExporter as unknown as VideoExporter;
					const result = await gifExporter.export();

					if (result.success && result.blob) {
						const arrayBuffer = await result.blob.arrayBuffer();
						const timestamp = Date.now();
						const fileName = `export-${timestamp}.gif`;

						const saveResult = await window.electronAPI.saveExportedVideo(arrayBuffer, fileName);

						if (saveResult.canceled) {
							toast.info("Export canceled");
						} else if (saveResult.success && saveResult.path) {
							showExportSuccessToast(saveResult.path);
							setExportedFilePath(saveResult.path);
						} else {
							setExportError(saveResult.message || "Failed to save GIF");
							toast.error(saveResult.message || "Failed to save GIF");
						}
					} else {
						setExportError(result.error || "GIF export failed");
						toast.error(result.error || "GIF export failed");
					}
				} else {
					// MP4 Export
					const quality = settings.quality || exportQuality;
					let exportWidth: number;
					let exportHeight: number;
					let bitrate: number;

					if (quality === "source") {
						// Use source resolution
						exportWidth = sourceWidth;
						exportHeight = sourceHeight;

						if (aspectRatioValue === 1) {
							// Square (1:1): use smaller dimension to avoid codec limits
							const baseDimension = Math.floor(Math.min(sourceWidth, sourceHeight) / 2) * 2;
							exportWidth = baseDimension;
							exportHeight = baseDimension;
						} else if (aspectRatioValue > 1) {
							// Landscape: find largest even dimensions that exactly match aspect ratio
							const baseWidth = Math.floor(sourceWidth / 2) * 2;
							let found = false;
							for (let w = baseWidth; w >= 100 && !found; w -= 2) {
								const h = Math.round(w / aspectRatioValue);
								if (h % 2 === 0 && Math.abs(w / h - aspectRatioValue) < 0.0001) {
									exportWidth = w;
									exportHeight = h;
									found = true;
								}
							}
							if (!found) {
								exportWidth = baseWidth;
								exportHeight = Math.floor(baseWidth / aspectRatioValue / 2) * 2;
							}
						} else {
							// Portrait: find largest even dimensions that exactly match aspect ratio
							const baseHeight = Math.floor(sourceHeight / 2) * 2;
							let found = false;
							for (let h = baseHeight; h >= 100 && !found; h -= 2) {
								const w = Math.round(h * aspectRatioValue);
								if (w % 2 === 0 && Math.abs(w / h - aspectRatioValue) < 0.0001) {
									exportWidth = w;
									exportHeight = h;
									found = true;
								}
							}
							if (!found) {
								exportHeight = baseHeight;
								exportWidth = Math.floor((baseHeight * aspectRatioValue) / 2) * 2;
							}
						}

						// Calculate visually lossless bitrate matching screen recording optimization
						const totalPixels = exportWidth * exportHeight;
						bitrate = 30_000_000;
						if (totalPixels > 1920 * 1080 && totalPixels <= 2560 * 1440) {
							bitrate = 50_000_000;
						} else if (totalPixels > 2560 * 1440) {
							bitrate = 80_000_000;
						}
					} else {
						// Use quality-based target resolution
						const targetHeight = quality === "medium" ? 720 : 1080;

						// Calculate dimensions maintaining aspect ratio
						exportHeight = Math.floor(targetHeight / 2) * 2;
						exportWidth = Math.floor((exportHeight * aspectRatioValue) / 2) * 2;

						// Adjust bitrate for lower resolutions
						const totalPixels = exportWidth * exportHeight;
						if (totalPixels <= 1280 * 720) {
							bitrate = 10_000_000;
						} else if (totalPixels <= 1920 * 1080) {
							bitrate = 20_000_000;
						} else {
							bitrate = 30_000_000;
						}
					}

					const exporter = new VideoExporter({
						videoUrl: videoPath,
						width: exportWidth,
						height: exportHeight,
						frameRate: 60,
						bitrate,
						codec: "avc1.640033",
						wallpaper,
						zoomRegions,
						trimRegions,
						speedRegions,
						showShadow: shadowIntensity > 0,
						shadowIntensity,
						showBlur,
						motionBlurEnabled,
						zoomMotionBlur,
						connectZooms,
						borderRadius,
						padding,
						cropRegion,
						annotationRegions,
						transcriptSegments,
						captionSettings,
						cursorTelemetry,
						cursorClickPulseSettings,
						keystrokeTelemetry,
						keystrokeOverlaySettings,
						previewWidth,
						previewHeight,
						onProgress: (progress: ExportProgress) => {
							setExportProgress(progress);
						},
					});

					exporterRef.current = exporter;
					const result = await exporter.export();

					if (result.success && result.blob) {
						const arrayBuffer = await result.blob.arrayBuffer();
						const timestamp = Date.now();
						const fileName = `export-${timestamp}.mp4`;

						const saveResult = await window.electronAPI.saveExportedVideo(arrayBuffer, fileName);

						if (saveResult.canceled) {
							toast.info("Export canceled");
						} else if (saveResult.success && saveResult.path) {
							showExportSuccessToast(saveResult.path);
							setExportedFilePath(saveResult.path);
						} else {
							setExportError(saveResult.message || "Failed to save video");
							toast.error(saveResult.message || "Failed to save video");
						}
					} else {
						setExportError(result.error || "Export failed");
						toast.error(result.error || "Export failed");
					}
				}

				if (wasPlaying) {
					videoPlaybackRef.current?.play();
				}
			} catch (error) {
				console.error("Export error:", error);
				const errorMessage = error instanceof Error ? error.message : "Unknown error";
				setExportError(errorMessage);
				toast.error(`Export failed: ${errorMessage}`);
			} finally {
				setIsExporting(false);
				exporterRef.current = null;
				// Reset dialog state to ensure it can be opened again on next export
				// This fixes the bug where second export doesn't show save dialog
				setShowExportDialog(false);
				setExportProgress(null);
			}
		},
		[
			videoPath,
			wallpaper,
			zoomRegions,
			trimRegions,
			speedRegions,
			shadowIntensity,
			showBlur,
			motionBlurEnabled,
			borderRadius,
			padding,
			cropRegion,
			annotationRegions,
			transcriptSegments,
			captionSettings,
			keystrokeTelemetry,
			keystrokeOverlaySettings,
			isPlaying,
			aspectRatio,
			exportQuality,
		],
	);

	const handleOpenExportDialog = useCallback(() => {
		if (!videoPath) {
			toast.error("No video loaded");
			return;
		}

		const video = videoPlaybackRef.current?.video;
		if (!video) {
			toast.error("Video not ready");
			return;
		}

		// Build export settings from current state
		const sourceWidth = video.videoWidth || 1920;
		const sourceHeight = video.videoHeight || 1080;
		const gifDimensions = calculateOutputDimensions(
			sourceWidth,
			sourceHeight,
			gifSizePreset,
			GIF_SIZE_PRESETS,
		);

		const settings: ExportSettings = {
			format: exportFormat,
			quality: exportFormat === "mp4" ? exportQuality : undefined,
			gifConfig:
				exportFormat === "gif"
					? {
							frameRate: gifFrameRate,
							loop: gifLoop,
							sizePreset: gifSizePreset,
							width: gifDimensions.width,
							height: gifDimensions.height,
						}
					: undefined,
		};

		setShowExportDialog(true);
		setExportError(null);

		// Start export immediately
		handleExport(settings);
	}, [videoPath, exportFormat, exportQuality, gifFrameRate, gifLoop, gifSizePreset, handleExport]);

	const handleCancelExport = useCallback(() => {
		if (exporterRef.current) {
			exporterRef.current.cancel();
			toast.info("Export canceled");
			setShowExportDialog(false);
			setIsExporting(false);
			setExportProgress(null);
			setExportError(null);
			setExportedFilePath(undefined);
		}
	}, []);

	const handleExportDialogClose = useCallback(() => {
		setShowExportDialog(false);
		setExportedFilePath(undefined);
	}, []);

	const showExportSuccessToast = useCallback((filePath: string) => {
		toast.success(`Exported successfully to ${filePath}`, {
			action: {
				label: "Show in Folder",
				onClick: async () => {
					try {
						const result = await window.electronAPI.revealInFolder(filePath);
						if (!result.success) {
							const errorMessage =
								result.error || result.message || "Failed to reveal item in folder.";
							toast.error(errorMessage);
						}
					} catch (err) {
						toast.error(`Error revealing in folder: ${String(err)}`);
					}
				},
			},
		});
	}, []);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-screen bg-background">
				<div className="text-foreground">Loading video...</div>
			</div>
		);
	}
	if (error) {
		return (
			<div className="flex items-center justify-center h-screen bg-background">
				<div className="flex flex-col items-center gap-3">
					<div className="text-destructive">{error}</div>
					<button
						type="button"
						onClick={handleLoadProject}
						className="px-3 py-1.5 rounded-md bg-[#34B27B] text-white text-sm hover:bg-[#34B27B]/90"
					>
						Load Project File
					</button>
				</div>
			</div>
		);
	}

	const aiConfigStatus = aiConfig
		? aiConfig.enabled
			? isAIConfigReady(aiConfig)
				? `${aiConfig.provider}${aiConfig.useVision ? " + vision" : ""}`
				: `${aiConfig.provider} needs setup`
			: "Disabled"
		: "Not configured";
	const aiReady = aiConfig ? aiConfig.enabled && isAIConfigReady(aiConfig) : false;
	const aiStatusClassName = aiReady
		? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
		: aiConfig?.enabled
			? "border-amber-500/20 bg-amber-500/10 text-amber-300"
			: "border-white/10 bg-white/5 text-slate-400";

	return (
		<div className="flex flex-col h-screen bg-[#09090b] text-slate-200 overflow-hidden selection:bg-[#34B27B]/30">
			<div
				className="h-10 flex-shrink-0 bg-[#09090b]/80 backdrop-blur-md border-b border-white/5 flex items-center justify-between px-6 z-50"
				style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
			>
				<div className="flex-1" />
				<div
					className="flex items-center gap-2"
					style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
				>
					<span
						className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${aiStatusClassName}`}
					>
						AI {aiConfigStatus}
					</span>
					<button
						type="button"
						onClick={() => setShowAISettings(true)}
						className="inline-flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/10"
					>
						<Sparkles className={`h-3.5 w-3.5 ${aiReady ? "text-emerald-300" : "text-purple-300"}`} />
						AI Assist
					</button>
				</div>
			</div>

			<div className="flex-1 p-5 gap-4 flex min-h-0 relative">
				{/* Left Column - Video & Timeline */}
				<div className="flex-[7] flex flex-col gap-3 min-w-0 h-full">
					<PanelGroup direction="vertical" className="gap-3">
						{/* Top section: video preview and controls */}
						<Panel defaultSize={70} minSize={40}>
							<div className="w-full h-full flex flex-col items-center justify-center bg-black/40 rounded-2xl border border-white/5 shadow-2xl overflow-hidden">
								{/* Video preview */}
								<div
									className="w-full flex justify-center items-center"
									style={{ flex: "1 1 auto", margin: "6px 0 0" }}
								>
									<div
										className="relative"
										style={{
											width: "auto",
											height: "100%",
											aspectRatio: getAspectRatioValue(aspectRatio),
											maxWidth: "100%",
											margin: "0 auto",
											boxSizing: "border-box",
										}}
									>
										<VideoPlayback
											key={videoPath || "no-video"}
											aspectRatio={aspectRatio}
											ref={videoPlaybackRef}
											videoPath={videoPath || ""}
											onDurationChange={setDuration}
											onTimeUpdate={setCurrentTime}
											currentTime={currentTime}
											onPlayStateChange={setIsPlaying}
											onError={setError}
											wallpaper={wallpaper}
											zoomRegions={zoomRegions}
											selectedZoomId={selectedZoomId}
											onSelectZoom={handleSelectZoom}
											onZoomFocusChange={handleZoomFocusChange}
											isPlaying={isPlaying}
											showShadow={shadowIntensity > 0}
											shadowIntensity={shadowIntensity}
											showBlur={showBlur}
											motionBlurEnabled={motionBlurEnabled}
											zoomMotionBlur={zoomMotionBlur}
											connectZooms={connectZooms}
											borderRadius={borderRadius}
											padding={padding}
											cropRegion={cropRegion}
											trimRegions={trimRegions}
											speedRegions={speedRegions}
											annotationRegions={annotationRegions}
											transcriptSegments={transcriptSegments}
											captionSettings={captionSettings}
											cursorTelemetry={cursorTelemetry}
											cursorClickPulseSettings={cursorClickPulseSettings}
											keystrokeTelemetry={keystrokeTelemetry}
											keystrokeOverlaySettings={keystrokeOverlaySettings}
											selectedAnnotationId={selectedAnnotationId}
											onSelectAnnotation={handleSelectAnnotation}
											onAnnotationPositionChange={handleAnnotationPositionChange}
											onAnnotationSizeChange={handleAnnotationSizeChange}
										/>
									</div>
								</div>
								{/* Playback controls */}
								<div
									className="w-full flex justify-center items-center"
									style={{
										height: "48px",
										flexShrink: 0,
										padding: "6px 12px",
										margin: "6px 0 6px 0",
									}}
								>
									<div style={{ width: "100%", maxWidth: "700px" }}>
										<PlaybackControls
											isPlaying={isPlaying}
											currentTime={currentTime}
											duration={duration}
											onTogglePlayPause={togglePlayPause}
											onSeek={handleSeek}
										/>
									</div>
								</div>
							</div>
						</Panel>

						<PanelResizeHandle className="h-3 bg-[#09090b]/80 hover:bg-[#09090b] transition-colors rounded-full mx-4 flex items-center justify-center">
							<div className="w-8 h-1 bg-white/20 rounded-full"></div>
						</PanelResizeHandle>

						{/* Timeline section */}
						<Panel defaultSize={30} minSize={20}>
							<div className="h-full bg-[#09090b] rounded-2xl border border-white/5 shadow-lg overflow-hidden flex flex-col">
								<TimelineEditor
									videoDuration={duration}
									currentTime={currentTime}
									onSeek={handleSeek}
									cursorTelemetry={cursorTelemetry}
									zoomRegions={zoomRegions}
									onZoomAdded={handleZoomAdded}
									onZoomSuggested={handleZoomSuggested}
									onZoomSpanChange={handleZoomSpanChange}
									onZoomDelete={handleZoomDelete}
									selectedZoomId={selectedZoomId}
									onSelectZoom={handleSelectZoom}
									trimRegions={trimRegions}
									onTrimAdded={handleTrimAdded}
									onTrimSpanChange={handleTrimSpanChange}
									onTrimDelete={handleTrimDelete}
									selectedTrimId={selectedTrimId}
									onSelectTrim={handleSelectTrim}
									speedRegions={speedRegions}
									onSpeedAdded={handleSpeedAdded}
									onSpeedSpanChange={handleSpeedSpanChange}
									onSpeedDelete={handleSpeedDelete}
									selectedSpeedId={selectedSpeedId}
									onSelectSpeed={handleSelectSpeed}
									annotationRegions={annotationRegions}
									onAnnotationAdded={handleAnnotationAdded}
									onAnnotationSpanChange={handleAnnotationSpanChange}
									onAnnotationDelete={handleAnnotationDelete}
									selectedAnnotationId={selectedAnnotationId}
									onSelectAnnotation={handleSelectAnnotation}
									aspectRatio={aspectRatio}
									onAspectRatioChange={setAspectRatio}
								/>
							</div>
						</Panel>
					</PanelGroup>
				</div>

				{/* Right section: settings panel */}
				<SettingsPanel
					selected={wallpaper}
					onWallpaperChange={setWallpaper}
					selectedZoomDepth={
						selectedZoomId ? zoomRegions.find((z) => z.id === selectedZoomId)?.depth : null
					}
					onZoomDepthChange={(depth) => selectedZoomId && handleZoomDepthChange(depth)}
					selectedZoomId={selectedZoomId}
					onZoomDelete={handleZoomDelete}
					selectedTrimId={selectedTrimId}
					onTrimDelete={handleTrimDelete}
					shadowIntensity={shadowIntensity}
					onShadowChange={setShadowIntensity}
					showBlur={showBlur}
					onBlurChange={setShowBlur}
					motionBlurEnabled={motionBlurEnabled}
					onMotionBlurChange={setMotionBlurEnabled}
					connectZooms={connectZooms}
					onConnectZoomsChange={setConnectZooms}
					zoomMotionBlur={zoomMotionBlur}
					onZoomMotionBlurChange={setZoomMotionBlur}
					borderRadius={borderRadius}
					onBorderRadiusChange={setBorderRadius}
					padding={padding}
					onPaddingChange={setPadding}
					cropRegion={cropRegion}
					onCropChange={setCropRegion}
					aspectRatio={aspectRatio}
					videoElement={videoPlaybackRef.current?.video || null}
					exportQuality={exportQuality}
					onExportQualityChange={setExportQuality}
					exportFormat={exportFormat}
					onExportFormatChange={setExportFormat}
					gifFrameRate={gifFrameRate}
					onGifFrameRateChange={setGifFrameRate}
					gifLoop={gifLoop}
					onGifLoopChange={setGifLoop}
					gifSizePreset={gifSizePreset}
					onGifSizePresetChange={setGifSizePreset}
					gifOutputDimensions={calculateOutputDimensions(
						videoPlaybackRef.current?.video?.videoWidth || 1920,
						videoPlaybackRef.current?.video?.videoHeight || 1080,
						gifSizePreset,
						GIF_SIZE_PRESETS,
					)}
					onExport={handleOpenExportDialog}
					captionSettings={captionSettings}
					onCaptionSettingsChange={handleCaptionSettingsChange}
					hasTranscript={transcriptSegments.length > 0}
					cursorClickPulseSettings={cursorClickPulseSettings}
					onCursorClickPulseSettingsChange={handleCursorClickPulseSettingsChange}
					hasClickTelemetry={hasClickTelemetry}
					keystrokeOverlaySettings={keystrokeOverlaySettings}
					onKeystrokeOverlaySettingsChange={handleKeystrokeOverlaySettingsChange}
					hasKeystrokes={keystrokeTelemetry.length > 0}
					selectedAnnotationId={selectedAnnotationId}
					annotationRegions={annotationRegions}
					onAnnotationContentChange={handleAnnotationContentChange}
					onAnnotationTypeChange={handleAnnotationTypeChange}
					onAnnotationStyleChange={handleAnnotationStyleChange}
					onAnnotationFigureDataChange={(id, data) =>
						handleAnnotationFigureDataChange(id, data as FigureData)
					}
					onAnnotationDelete={handleAnnotationDelete}
					onSaveProject={handleSaveProject}
					onLoadProject={handleLoadProject}
					selectedSpeedId={selectedSpeedId}
					selectedSpeedValue={
						selectedSpeedId
							? (speedRegions.find((r) => r.id === selectedSpeedId)?.speed ?? null)
							: null
					}
					onSpeedChange={handleSpeedChange}
					onSpeedDelete={handleSpeedDelete}
					smartDemoSlot={
						<SmartDemoPanel
							cursorTelemetry={cursorTelemetry}
							duration={duration}
							isAutoMode={smartDemoAutoMode}
							videoPath={videoPath}
							aiConfig={aiConfig}
							aiPrompt={aiPrompt}
							aiSuggestion={aiSuggestion}
							aiStatus={aiStatus}
							aiError={aiError}
							transcriptSegments={transcriptSegments}
							transcriptSourceLabel={transcriptSourceLabel}
							transcriptStatus={transcriptStatus}
							transcriptError={transcriptError}
							captionSettings={captionSettings}
							transcriptionConfig={transcriptionConfig}
							transcriptionOptions={transcriptionOptions}
							nativeClickCaptureStatus={nativeClickCaptureStatus}
							usesNativeClickTelemetry={usesNativeClickTelemetry}
							nativeClickTelemetryCount={nativeClickTelemetryCount}
							transcriptWarnings={transcriptAnalysis.warnings}
							localSpeechAnchorCount={transcriptAnalysis.speechAnchors.length}
							localFocusMomentCount={transcriptAnalysis.focusMoments.length}
							onAISettingsClick={() => setShowAISettings(true)}
							onAIPromptChange={setAIPrompt}
							onImportTranscript={handleImportTranscript}
							onTranscribeAudio={handleTranscribeAudio}
							onSaveTranscriptionConfig={handleSaveTranscriptionConfig}
							onCaptionSettingsChange={handleCaptionSettingsChange}
							onRequestNativeClickCaptureAccess={handleRequestNativeClickCaptureAccess}
							onOpenNativeClickCaptureSettings={handleOpenNativeClickCaptureSettings}
							onClearTranscript={handleClearTranscript}
							onReviewTranscript={() => setShowTranscriptReview(true)}
							onExportTranscript={handleExportTranscript}
							onRunAIAnalysis={handleRunAIAnalysis}
							onApplyAISuggestion={handleApplyAISuggestion}
							onApplyAIZooms={handleApplyAIZooms}
							onApplyAITrims={handleApplyAITrims}
							onApplyZoomRegions={handleSmartDemoApplyZoom}
							onApplyAnnotations={handleSmartDemoApplyAnnotations}
							onApplyTrimRegions={handleSmartDemoApplyTrim}
							onApplyPolishDemo={handlePolishDemo}
							onSeekToTime={handleSeek}
						/>
					}
				/>
			</div>

			<Toaster theme="dark" className="pointer-events-auto" />

			<ExportDialog
				isOpen={showExportDialog}
				onClose={handleExportDialogClose}
				progress={exportProgress}
				isExporting={isExporting}
				error={exportError}
				onCancel={handleCancelExport}
				exportFormat={exportFormat}
				exportedFilePath={exportedFilePath}
			/>

			<AISettingsDialog
				isOpen={showAISettings}
				onOpenChange={setShowAISettings}
				config={aiConfig}
				onSave={handleSaveAIConfig}
				onTest={handleTestAIConnection}
				onClear={handleClearAIConfig}
				isSaving={isSavingAIConfig}
				isTesting={isTestingAIConnection}
				error={aiError}
			/>

			<TranscriptReviewDialog
				isOpen={showTranscriptReview}
				onOpenChange={setShowTranscriptReview}
				segments={transcriptSegments}
				warnings={transcriptAnalysis.warnings}
				sourceLabel={transcriptSourceLabel}
				onSave={handleSaveTranscriptEdits}
			/>
		</div>
	);
}
