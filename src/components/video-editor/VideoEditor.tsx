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
import { FlipHorizontal2, Redo2, Sparkles, Undo2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { useShortcuts } from "@/contexts/ShortcutsContext";
import { isAIManagedRegionId } from "@/lib/ai/applySmartDemoAISuggestion";
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
	type ProjectEditorState,
	toFileUrl,
	validateProjectData,
	WALLPAPER_PATHS,
} from "./projectPersistence";
import { SettingsPanel } from "./SettingsPanel";
import { SmartDemoSheet } from "./SmartDemoSheet";
import { TranscriptReviewDialog } from "./TranscriptReviewDialog";
import TimelineEditor from "./timeline/TimelineEditor";
import {
	type AnnotationRegion,
	type CaptionSettings,
	type CropRegion,
	type CursorClickPulseSettings,
	type CursorTelemetryPoint,
	clampFocusToDepth,
	DEFAULT_ANNOTATION_POSITION,
	DEFAULT_ANNOTATION_SIZE,
	DEFAULT_ANNOTATION_STYLE,
	DEFAULT_CAPTION_SETTINGS,
	DEFAULT_CROP_REGION,
	DEFAULT_CURSOR_CLICK_PULSE_SETTINGS,
	DEFAULT_FIGURE_DATA,
	DEFAULT_KEYSTROKE_OVERLAY_SETTINGS,
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
	const [showOriginalPreview, setShowOriginalPreview] = useState(false);
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
	const [aiSuggestion, setAISuggestion] = useState<SmartDemoAISuggestion | null>(null);
	const [, setAIStatus] = useState<"idle" | "analyzing" | "error">("idle");
	const [aiError, setAIError] = useState<string | null>(null);
	const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
	const [transcriptSourceLabel, setTranscriptSourceLabel] = useState<string | null>(null);
	const [transcriptStatus, setTranscriptStatus] = useState<
		"idle" | "importing" | "transcribing" | "ready" | "error"
	>("idle");
	const [transcriptError, setTranscriptError] = useState<string | null>(null);
	const [captionSettings, setCaptionSettings] = useState<CaptionSettings>(DEFAULT_CAPTION_SETTINGS);
	const [cursorClickPulseSettings, setCursorClickPulseSettings] =
		useState<CursorClickPulseSettings>(DEFAULT_CURSOR_CLICK_PULSE_SETTINGS);
	const [keystrokeOverlaySettings, setKeystrokeOverlaySettings] =
		useState<KeystrokeOverlaySettings>(DEFAULT_KEYSTROKE_OVERLAY_SETTINGS);
	const [transcriptionConfig, setTranscriptionConfig] = useState<PublicTranscriptionConfig>({
		provider: "auto",
		enabled: true,
	});
	const [transcriptionOptions, setTranscriptionOptions] = useState<TranscriptionProviderOption[]>(
		[],
	);

	const [showTranscriptReview, setShowTranscriptReview] = useState(false);
	const [showAISettings, setShowAISettings] = useState(false);
	const [showSmartDemoSheet, setShowSmartDemoSheet] = useState(false);
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
	const [undoStack, setUndoStack] = useState<string[]>([]);
	const [redoStack, setRedoStack] = useState<string[]>([]);

	const videoPlaybackRef = useRef<VideoPlaybackRef>(null);
	const nextZoomIdRef = useRef(1);
	const nextTrimIdRef = useRef(1);
	const nextSpeedIdRef = useRef(1);

	const { shortcuts, isMac } = useShortcuts();
	const nextAnnotationIdRef = useRef(1);
	const nextAnnotationZIndexRef = useRef(1); // Track z-index for stacking order
	const exporterRef = useRef<VideoExporter | null>(null);
	const lastTranscriptVideoSourceRef = useRef<string | null>(null);
	const isRestoringHistoryRef = useRef(false);
	const shouldAutoTranscribeRef = useRef(false);
	const lastHistorySnapshotRef = useRef<string | null>(null);

	const buildEditorState = useCallback((): ProjectEditorState => {
		return {
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
		};
	}, [
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

	const applyEditorState = useCallback((editor: ProjectEditorState) => {
		setWallpaper(editor.wallpaper);
		setShadowIntensity(editor.shadowIntensity);
		setShowBlur(editor.showBlur);
		setMotionBlurEnabled(editor.motionBlurEnabled);
		setConnectZooms(editor.connectZooms);
		setZoomMotionBlur(editor.zoomMotionBlur);
		setBorderRadius(editor.borderRadius);
		setPadding(editor.padding);
		setCropRegion(editor.cropRegion);
		setZoomRegions(editor.zoomRegions);
		setTrimRegions(editor.trimRegions);
		setSpeedRegions(editor.speedRegions);
		setAnnotationRegions(editor.annotationRegions);
		setAspectRatio(editor.aspectRatio);
		setExportQuality(editor.exportQuality);
		setExportFormat(editor.exportFormat);
		setGifFrameRate(editor.gifFrameRate);
		setGifLoop(editor.gifLoop);
		setGifSizePreset(editor.gifSizePreset);
		setTranscriptSegments(editor.transcriptSegments);
		setCaptionSettings(editor.captionSettings);
		setCursorClickPulseSettings(editor.cursorClickPulseSettings);
		setKeystrokeOverlaySettings(editor.keystrokeOverlaySettings);

		setSelectedZoomId(null);
		setSelectedTrimId(null);
		setSelectedSpeedId(null);
		setSelectedAnnotationId(null);

		nextZoomIdRef.current = deriveNextId(
			"zoom",
			editor.zoomRegions.map((region) => region.id),
		);
		nextTrimIdRef.current = deriveNextId(
			"trim",
			editor.trimRegions.map((region) => region.id),
		);
		nextSpeedIdRef.current = deriveNextId(
			"speed",
			editor.speedRegions.map((region) => region.id),
		);
		nextAnnotationIdRef.current = deriveNextId(
			"annotation",
			editor.annotationRegions.map((region) => region.id),
		);
		nextAnnotationZIndexRef.current =
			editor.annotationRegions.reduce((max, region) => Math.max(max, region.zIndex), 0) + 1;
	}, []);

	const applyLoadedProject = useCallback(
		async (candidate: unknown, path?: string | null) => {
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
			applyEditorState(normalizedEditor);
			setTranscriptSourceLabel(
				normalizedEditor.transcriptSegments.length > 0 ? "Saved project transcript" : null,
			);
			setTranscriptStatus(normalizedEditor.transcriptSegments.length > 0 ? "ready" : "idle");
			setTranscriptError(null);

			setLastSavedSnapshot(JSON.stringify(createProjectData(sourcePath, normalizedEditor)));
			const restoredSnapshot = JSON.stringify(normalizedEditor);
			lastHistorySnapshotRef.current = restoredSnapshot;
			setUndoStack([]);
			setRedoStack([]);
			return true;
		},
		[applyEditorState],
	);

	const currentProjectSnapshot = useMemo(() => {
		const sourcePath = videoSourcePath ?? (videoPath ? fromFileUrl(videoPath) : null);
		if (!sourcePath) {
			return null;
		}
		return JSON.stringify(createProjectData(sourcePath, buildEditorState()));
	}, [videoSourcePath, videoPath, buildEditorState]);

	const currentEditorSnapshot = useMemo(
		() => JSON.stringify(buildEditorState()),
		[buildEditorState],
	);

	useEffect(() => {
		if (loading) {
			return;
		}

		if (isRestoringHistoryRef.current) {
			lastHistorySnapshotRef.current = currentEditorSnapshot;
			isRestoringHistoryRef.current = false;
			return;
		}

		const previousSnapshot = lastHistorySnapshotRef.current;
		if (previousSnapshot === null) {
			lastHistorySnapshotRef.current = currentEditorSnapshot;
			return;
		}

		if (previousSnapshot === currentEditorSnapshot) {
			return;
		}

		setUndoStack((prev) => {
			const next = [...prev, previousSnapshot];
			return next.length > 75 ? next.slice(next.length - 75) : next;
		});
		setRedoStack([]);
		lastHistorySnapshotRef.current = currentEditorSnapshot;
	}, [currentEditorSnapshot, loading]);

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
	const hasClickTelemetry = useMemo(
		() =>
			cursorTelemetry.some((sample) => isClickTelemetryPoint(sample) && sample.phase === "down"),
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
					if ((result as { hasSidecar?: boolean }).hasSidecar) {
						shouldAutoTranscribeRef.current = true;
					}
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
			if (segments.length > 0 && segments[0]) {
				handleSeek(segments[0].startMs / 1000);
			}
			toast.success(
				`Captions ready — ${segments.length} segment${segments.length === 1 ? "" : "s"} transcribed`,
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			setTranscriptStatus("error");
			setTranscriptError(message);
			toast.error(message);
		}
	}, [
		handleSeek,
		labelFromPath,
		resetAIInsightState,
		selectedTranscriptionOption,
		transcriptionConfig,
		videoPath,
		videoSourcePath,
	]);

	// Auto-transcribe when a fresh recording with a mic sidecar is loaded
	useEffect(() => {
		if (
			shouldAutoTranscribeRef.current &&
			videoSourcePath &&
			transcriptionOptions.some((o) => o.available) &&
			transcriptStatus === "idle"
		) {
			shouldAutoTranscribeRef.current = false;
			void handleTranscribeAudio();
		}
	}, [videoSourcePath, transcriptionOptions, transcriptStatus, handleTranscribeAudio]);

	const handleClearTranscript = useCallback(() => {
		setTranscriptSegments([]);
		setTranscriptSourceLabel(null);
		setTranscriptStatus("idle");
		setTranscriptError(null);
		resetAIInsightState();
		toast.success("Transcript cleared");
	}, [resetAIInsightState]);

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

	const handleUndo = useCallback(() => {
		if (undoStack.length === 0) {
			return;
		}

		const previousSnapshot = undoStack[undoStack.length - 1]!;
		const previousState = normalizeProjectEditor(
			JSON.parse(previousSnapshot) as ProjectEditorState,
		);
		isRestoringHistoryRef.current = true;
		setUndoStack((prev) => prev.slice(0, -1));
		setRedoStack((prev) => [...prev, currentEditorSnapshot]);
		applyEditorState(previousState);
		toast.success("Undid last change");
	}, [undoStack, currentEditorSnapshot, applyEditorState]);

	const handleRedo = useCallback(() => {
		if (redoStack.length === 0) {
			return;
		}

		const nextSnapshot = redoStack[redoStack.length - 1]!;
		const nextState = normalizeProjectEditor(JSON.parse(nextSnapshot) as ProjectEditorState);
		isRestoringHistoryRef.current = true;
		setRedoStack((prev) => prev.slice(0, -1));
		setUndoStack((prev) => [...prev, currentEditorSnapshot]);
		applyEditorState(nextState);
		toast.success("Redid change");
	}, [redoStack, currentEditorSnapshot, applyEditorState]);

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

	// Global Tab prevention
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement | null;
			const isEditableTarget =
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target?.isContentEditable === true;

			const primaryModifier = isMac ? e.metaKey : e.ctrlKey;
			if (primaryModifier && e.key.toLowerCase() === "z" && !isEditableTarget) {
				e.preventDefault();
				if (e.shiftKey) {
					handleRedo();
				} else {
					handleUndo();
				}
				return;
			}

			if (e.key === "Tab") {
				// Allow tab only in inputs/textareas
				if (isEditableTarget) {
					return;
				}
				e.preventDefault();
			}

			if (matchesShortcut(e, shortcuts.playPause, isMac)) {
				// Allow space only in inputs/textareas
				if (isEditableTarget) {
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
	}, [shortcuts, isMac, handleUndo, handleRedo]);

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
	const previewWallpaper = showOriginalPreview ? "#000000" : wallpaper;
	const previewZoomRegions = showOriginalPreview ? [] : zoomRegions;
	const previewAnnotationRegions = showOriginalPreview ? [] : annotationRegions;
	const previewTranscriptSegments = showOriginalPreview ? [] : transcriptSegments;
	const previewCaptionSettings = showOriginalPreview
		? { ...captionSettings, showInPreview: false }
		: captionSettings;
	const previewCursorClickPulseSettings = showOriginalPreview
		? { ...cursorClickPulseSettings, showInPreview: false }
		: cursorClickPulseSettings;
	const previewKeystrokeOverlaySettings = showOriginalPreview
		? { ...keystrokeOverlaySettings, showInPreview: false }
		: keystrokeOverlaySettings;
	const previewCropRegion = showOriginalPreview ? DEFAULT_CROP_REGION : cropRegion;
	const previewPadding = showOriginalPreview ? 0 : padding;
	const previewBorderRadius = showOriginalPreview ? 0 : borderRadius;
	const previewShowShadow = showOriginalPreview ? false : shadowIntensity > 0;
	const previewShadowIntensity = showOriginalPreview ? 0 : shadowIntensity;
	const previewShowBlur = showOriginalPreview ? false : showBlur;
	const previewMotionBlurEnabled = showOriginalPreview ? false : motionBlurEnabled;
	const previewZoomMotionBlur = showOriginalPreview ? 0 : zoomMotionBlur;
	const previewConnectZooms = showOriginalPreview ? false : connectZooms;

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
					<button
						type="button"
						onClick={handleUndo}
						disabled={undoStack.length === 0}
						className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
						aria-label="Undo"
						title="Undo"
					>
						<Undo2 className="h-3.5 w-3.5" />
					</button>
					<button
						type="button"
						onClick={handleRedo}
						disabled={redoStack.length === 0}
						className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
						aria-label="Redo"
						title="Redo"
					>
						<Redo2 className="h-3.5 w-3.5" />
					</button>
					<span
						className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${aiStatusClassName}`}
					>
						AI {aiConfigStatus}
					</span>
					<button
						type="button"
						onClick={() => setShowOriginalPreview((current) => !current)}
						className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-medium transition-colors ${
							showOriginalPreview
								? "border-sky-500/30 bg-sky-500/10 text-sky-200 hover:bg-sky-500/15"
								: "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"
						}`}
					>
						<FlipHorizontal2 className="h-3.5 w-3.5" />
						{showOriginalPreview ? "Show Polished" : "Compare Original"}
					</button>
					<button
						type="button"
						onClick={() => setShowSmartDemoSheet(true)}
						className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[11px] font-medium transition-colors ${
							showSmartDemoSheet
								? "border-purple-500/40 bg-purple-500/15 text-purple-200 hover:bg-purple-500/20"
								: "border-white/10 bg-white/5 text-slate-200 hover:bg-white/10"
						}`}
					>
						<Wand2 className="h-3.5 w-3.5 text-purple-300" />
						Smart Demo
					</button>
					<button
						type="button"
						onClick={() => setShowAISettings(true)}
						className="inline-flex h-8 items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 text-[11px] font-medium text-slate-200 transition-colors hover:bg-white/10"
					>
						<Sparkles
							className={`h-3.5 w-3.5 ${aiReady ? "text-emerald-300" : "text-purple-300"}`}
						/>
						AI Assist
					</button>
				</div>
			</div>

			<div className="relative flex min-h-0 flex-1 gap-4 p-5">
				{/* Left Column - Video & Timeline */}
				<div className="flex-1 flex flex-col gap-3 min-w-0 h-full">
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
											wallpaper={previewWallpaper}
											zoomRegions={previewZoomRegions}
											selectedZoomId={selectedZoomId}
											onSelectZoom={handleSelectZoom}
											onZoomFocusChange={handleZoomFocusChange}
											isPlaying={isPlaying}
											showShadow={previewShowShadow}
											shadowIntensity={previewShadowIntensity}
											showBlur={previewShowBlur}
											motionBlurEnabled={previewMotionBlurEnabled}
											zoomMotionBlur={previewZoomMotionBlur}
											connectZooms={previewConnectZooms}
											borderRadius={previewBorderRadius}
											padding={previewPadding}
											cropRegion={previewCropRegion}
											trimRegions={trimRegions}
											speedRegions={speedRegions}
											annotationRegions={previewAnnotationRegions}
											transcriptSegments={previewTranscriptSegments}
											captionSettings={previewCaptionSettings}
											cursorTelemetry={cursorTelemetry}
											cursorClickPulseSettings={previewCursorClickPulseSettings}
											keystrokeTelemetry={keystrokeTelemetry}
											keystrokeOverlaySettings={previewKeystrokeOverlaySettings}
											selectedAnnotationId={selectedAnnotationId}
											onSelectAnnotation={handleSelectAnnotation}
											onAnnotationPositionChange={handleAnnotationPositionChange}
											onAnnotationSizeChange={handleAnnotationSizeChange}
										/>
										<div className="pointer-events-none absolute left-3 top-3 z-20">
											<span
												className={`rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.14em] ${
													showOriginalPreview
														? "border-sky-500/25 bg-sky-500/10 text-sky-200"
														: "border-[#34B27B]/25 bg-[#34B27B]/10 text-[#7fe3b0]"
												}`}
											>
												{showOriginalPreview ? "Original Preview" : "Polished Preview"}
											</span>
										</div>
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
											hasCaptions={transcriptSegments.length > 0}
											showCaptions={captionSettings.showInPreview}
											onToggleCaptions={() =>
												handleCaptionSettingsChange({
													showInPreview: !captionSettings.showInPreview,
												})
											}
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
				<div className="flex min-h-0 w-[300px] shrink-0">
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
					/>
				</div>
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

			<SmartDemoSheet open={showSmartDemoSheet} onClose={() => setShowSmartDemoSheet(false)}>
				<SmartDemoPanel
					cursorTelemetry={cursorTelemetry}
					duration={duration}
					isAutoMode={smartDemoAutoMode}
					videoPath={videoPath}
					transcriptSegments={transcriptSegments}
					transcriptStatus={transcriptStatus}
					transcriptError={transcriptError}
					captionSettings={captionSettings}
					transcriptionConfig={transcriptionConfig}
					transcriptionOptions={transcriptionOptions}
					onImportTranscript={handleImportTranscript}
					onTranscribeAudio={handleTranscribeAudio}
					onSaveTranscriptionConfig={handleSaveTranscriptionConfig}
					onCaptionSettingsChange={handleCaptionSettingsChange}
					onClearTranscript={handleClearTranscript}
					onReviewTranscript={() => setShowTranscriptReview(true)}
					onApplyZoomRegions={handleSmartDemoApplyZoom}
					onApplyAnnotations={handleSmartDemoApplyAnnotations}
					onApplyTrimRegions={handleSmartDemoApplyTrim}
					onApplyPolishDemo={handlePolishDemo}
					onSeekToTime={handleSeek}
				/>
			</SmartDemoSheet>
		</div>
	);
}
