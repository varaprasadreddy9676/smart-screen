import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, desktopCapturer, dialog, ipcMain, screen, shell } from "electron";
import { getTranscriptionAudioSidecarPath } from "../../shared/transcription";
import { fetchOllamaModels } from "../ai/ollamaModels";
import { runSmartDemoAIAnalysis, testStoredAIConnection } from "../ai/runSmartDemoAI";
import { clearAIConfigResult, getPublicAIConfigResult, saveAIConfigResult } from "../ai/store";
import { RECORDINGS_DIR } from "../main";
import {
	normalizeCursorDipPoint,
	normalizeNativeScreenPoint,
} from "../recording/cursorTelemetryMapping";
import { repairLegacyNativeClickScale } from "../recording/cursorTelemetryRepair";
import {
	getNativeClickCaptureStatus,
	type MouseClickMonitorSession,
	requestNativeClickCaptureAccess,
	startMacOSMouseClickMonitor,
} from "../recording/macosClickMonitor";
import {
	type KeyboardShortcutMonitorSession,
	startMacOSKeyboardShortcutMonitor,
} from "../recording/macosKeyboardMonitor";
import {
	getElapsedRecordingTimeMs,
	pauseRecordingClock,
	type RecordingClockState,
	resumeRecordingClock,
	startRecordingClock,
} from "../recording/recordingClock";
import {
	getTranscriptionConfigResult,
	getTranscriptionProviderOptionsResult,
	transcribeVideoResult,
} from "../transcription";
import { saveTranscriptionConfigResult } from "../transcription/store";

const PROJECT_FILE_EXTENSION = "openscreen";
const SHORTCUTS_FILE = path.join(app.getPath("userData"), "shortcuts.json");

type SelectedSource = {
	id?: string;
	display_id?: string;
	name: string;
	[key: string]: unknown;
};

let selectedSource: SelectedSource | null = null;
let currentVideoPath: string | null = null;
let currentProjectPath: string | null = null;

function normalizePath(filePath: string) {
	return path.resolve(filePath);
}

function isTrustedProjectPath(filePath?: string | null) {
	if (!filePath || !currentProjectPath) {
		return false;
	}
	return normalizePath(filePath) === normalizePath(currentProjectPath);
}

const CURSOR_TELEMETRY_VERSION = 2;
const KEYSTROKE_TELEMETRY_VERSION = 1;
const CURSOR_SAMPLE_INTERVAL_MS = 100;
const MAX_CURSOR_SAMPLES = 60 * 60 * 10; // 1 hour @ 10Hz
const MAX_KEYSTROKE_EVENTS = 5000;
const KEYSTROKE_MERGE_GAP_MS = 700;
const MAX_KEYSTROKE_CUE_LENGTH = 32;

interface CursorTelemetryPoint {
	timeMs: number;
	cx: number;
	cy: number;
	kind?: "move" | "click";
	button?: "left" | "right" | "middle" | "other";
	phase?: "down" | "up";
	source?: "sampled" | "native";
}

interface KeystrokeTelemetryEvent {
	timeMs: number;
	text: string;
	source?: "native";
}

let cursorCaptureInterval: NodeJS.Timeout | null = null;
let activeCursorSamples: CursorTelemetryPoint[] = [];
let pendingCursorSamples: CursorTelemetryPoint[] = [];
let mouseClickMonitorSession: MouseClickMonitorSession | null = null;
let keyboardShortcutMonitorSession: KeyboardShortcutMonitorSession | null = null;
let activeKeystrokeEvents: KeystrokeTelemetryEvent[] = [];
let pendingKeystrokeEvents: KeystrokeTelemetryEvent[] = [];
let smartDemoMode = false;
let recordingClock: RecordingClockState | null = null;
let recordingPaused = false;

function stopCursorCapture() {
	if (cursorCaptureInterval) {
		clearInterval(cursorCaptureInterval);
		cursorCaptureInterval = null;
	}
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function normalizeCursorPoint(point: { x: number; y: number }) {
	return normalizeCursorDipPoint({
		pointDip: point,
		selectedSource,
		displays: screen.getAllDisplays(),
		getNearestDisplay: (candidate) => screen.getDisplayNearestPoint(candidate),
	});
}

function normalizeNativePoint(point: { x: number; y: number }) {
	const maybeScreenToDipPoint = (
		screen as unknown as {
			screenToDipPoint?: (point: { x: number; y: number }) => { x: number; y: number };
		}
	).screenToDipPoint;

	return normalizeNativeScreenPoint({
		pointPhysical: point,
		selectedSource,
		displays: screen.getAllDisplays(),
		getNearestDisplay: (candidate) => screen.getDisplayNearestPoint(candidate),
		screenToDipPoint: maybeScreenToDipPoint,
	});
}

function sampleCursorPoint() {
	const cursor = screen.getCursorScreenPoint();
	const { cx, cy } = normalizeCursorPoint(cursor);

	activeCursorSamples.push({
		timeMs: getElapsedRecordingTimeMs(recordingClock, Date.now()),
		cx,
		cy,
		kind: "move",
		source: "sampled",
	});

	if (activeCursorSamples.length > MAX_CURSOR_SAMPLES) {
		activeCursorSamples.shift();
	}
}

function startCursorSamplingLoop() {
	stopCursorCapture();
	sampleCursorPoint();
	cursorCaptureInterval = setInterval(sampleCursorPoint, CURSOR_SAMPLE_INTERVAL_MS);
}

function getKeystrokeTelemetryPath(videoPath: string) {
	return `${videoPath}.keys.json`;
}

function isMergeableKeystrokeText(text: string) {
	return /^[\p{L}\p{N}\p{P}\p{S} ]$/u.test(text);
}

function appendKeystrokeEvent(
	events: KeystrokeTelemetryEvent[],
	event: KeystrokeTelemetryEvent,
	coalescible: boolean,
) {
	const normalizedText = event.text.replace(/\s+/g, " ").slice(0, MAX_KEYSTROKE_CUE_LENGTH);
	if (!normalizedText.trim()) {
		return;
	}

	if (coalescible && isMergeableKeystrokeText(normalizedText)) {
		const previous = events[events.length - 1];
		if (
			previous &&
			previous.source === "native" &&
			isMergeableKeystrokeText(previous.text.slice(-1)) &&
			event.timeMs - previous.timeMs <= KEYSTROKE_MERGE_GAP_MS
		) {
			previous.text = `${previous.text}${normalizedText}`.slice(-MAX_KEYSTROKE_CUE_LENGTH);
			previous.timeMs = event.timeMs;
			return;
		}
	}

	events.push({
		...event,
		text: normalizedText,
	});

	if (events.length > MAX_KEYSTROKE_EVENTS) {
		events.shift();
	}
}

async function stopMouseClickMonitor() {
	if (!mouseClickMonitorSession) {
		return;
	}

	const activeSession = mouseClickMonitorSession;
	mouseClickMonitorSession = null;
	await activeSession.stop().catch((error) => {
		console.warn("Failed to stop native mouse click monitor:", error);
	});
}

async function stopKeyboardShortcutMonitor() {
	if (!keyboardShortcutMonitorSession) {
		return;
	}

	const activeSession = keyboardShortcutMonitorSession;
	keyboardShortcutMonitorSession = null;
	await activeSession.stop().catch((error) => {
		console.warn("Failed to stop native keyboard shortcut monitor:", error);
	});
}

async function startNativeInputMonitors() {
	mouseClickMonitorSession = await startMacOSMouseClickMonitor({
		onEvent: (event) => {
			try {
				const { cx, cy } = normalizeNativePoint({ x: event.x, y: event.y });
				activeCursorSamples.push({
					timeMs: getElapsedRecordingTimeMs(recordingClock, event.timestampMs),
					cx,
					cy,
					kind: "click",
					button: event.button,
					phase: event.phase,
					source: "native",
				});
			} catch (error) {
				console.warn("Failed to normalize native mouse click event:", error);
			}
		},
		onError: (message) => {
			console.warn("Native mouse click monitor unavailable:", message);
		},
	}).catch((error) => {
		console.warn("Failed to start native mouse click monitor:", error);
		return null;
	});

	if (!mouseClickMonitorSession) {
		return;
	}

	keyboardShortcutMonitorSession = await startMacOSKeyboardShortcutMonitor({
		onEvent: (event) => {
			appendKeystrokeEvent(
				activeKeystrokeEvents,
				{
					timeMs: getElapsedRecordingTimeMs(recordingClock, event.timestampMs),
					text: event.text,
					source: "native",
				},
				event.coalescible,
			);
		},
		onError: (message) => {
			console.warn("Native keyboard shortcut monitor unavailable:", message);
		},
	}).catch((error) => {
		console.warn("Failed to start native keyboard shortcut monitor:", error);
		return null;
	});
}

export function registerIpcHandlers(
	createEditorWindow: () => void,
	createSourceSelectorWindow: () => BrowserWindow,
	getMainWindow: () => BrowserWindow | null,
	getSourceSelectorWindow: () => BrowserWindow | null,
	onRecordingStateChange?: (recording: boolean, sourceName: string, paused: boolean) => void,
) {
	ipcMain.handle("get-sources", async (_, opts) => {
		const sources = await desktopCapturer.getSources(opts);
		return sources.map((source) => ({
			id: source.id,
			name: source.name,
			display_id: source.display_id,
			thumbnail: source.thumbnail ? source.thumbnail.toDataURL() : null,
			appIcon: source.appIcon ? source.appIcon.toDataURL() : null,
		}));
	});

	ipcMain.handle("select-source", (_, source: SelectedSource) => {
		selectedSource = source;
		const sourceSelectorWin = getSourceSelectorWindow();
		if (sourceSelectorWin) {
			sourceSelectorWin.close();
		}
		return selectedSource;
	});

	ipcMain.handle("get-selected-source", () => {
		return selectedSource;
	});

	ipcMain.handle("open-source-selector", () => {
		const sourceSelectorWin = getSourceSelectorWindow();
		if (sourceSelectorWin) {
			sourceSelectorWin.focus();
			return;
		}
		createSourceSelectorWindow();
	});

	ipcMain.handle("switch-to-editor", () => {
		const mainWin = getMainWindow();
		if (mainWin) {
			mainWin.close();
		}
		createEditorWindow();
	});

	ipcMain.handle("store-recorded-video", async (_, videoData: ArrayBuffer, fileName: string) => {
		try {
			const videoPath = path.join(RECORDINGS_DIR, fileName);
			await fs.writeFile(videoPath, Buffer.from(videoData));
			currentVideoPath = videoPath;
			currentProjectPath = null;

			const telemetryPath = `${videoPath}.cursor.json`;
			if (pendingCursorSamples.length > 0) {
				await fs.writeFile(
					telemetryPath,
					JSON.stringify(
						{
							version: CURSOR_TELEMETRY_VERSION,
							samples: [...pendingCursorSamples].sort((a, b) => a.timeMs - b.timeMs),
						},
						null,
						2,
					),
					"utf-8",
				);
			}
			pendingCursorSamples = [];

			const keystrokeTelemetryPath = getKeystrokeTelemetryPath(videoPath);
			if (pendingKeystrokeEvents.length > 0) {
				await fs.writeFile(
					keystrokeTelemetryPath,
					JSON.stringify(
						{
							version: KEYSTROKE_TELEMETRY_VERSION,
							events: [...pendingKeystrokeEvents].sort((a, b) => a.timeMs - b.timeMs),
						},
						null,
						2,
					),
					"utf-8",
				);
			}
			pendingKeystrokeEvents = [];

			return {
				success: true,
				path: videoPath,
				message: "Video stored successfully",
			};
		} catch (error) {
			console.error("Failed to store video:", error);
			return {
				success: false,
				message: "Failed to store video",
				error: String(error),
			};
		}
	});

	ipcMain.handle(
		"store-recorded-transcription-audio",
		async (_, audioData: ArrayBuffer, videoPath: string) => {
			try {
				const sidecarPath = getTranscriptionAudioSidecarPath(videoPath);
				await fs.writeFile(sidecarPath, Buffer.from(audioData));
				return {
					success: true,
					path: sidecarPath,
					message: "Transcription audio stored successfully",
				};
			} catch (error) {
				console.error("Failed to store transcription audio:", error);
				return {
					success: false,
					message: "Failed to store transcription audio",
					error: String(error),
				};
			}
		},
	);

	ipcMain.handle("get-recorded-video-path", async () => {
		try {
			const files = await fs.readdir(RECORDINGS_DIR);
			const videoFiles = files.filter((file) => file.endsWith(".webm"));

			if (videoFiles.length === 0) {
				return { success: false, message: "No recorded video found" };
			}

			const latestVideo = videoFiles.sort().reverse()[0];
			const videoPath = path.join(RECORDINGS_DIR, latestVideo);

			return { success: true, path: videoPath };
		} catch (error) {
			console.error("Failed to get video path:", error);
			return { success: false, message: "Failed to get video path", error: String(error) };
		}
	});

	ipcMain.handle("set-recording-state", async (_, recording: boolean) => {
		if (recording) {
			stopCursorCapture();
			await stopMouseClickMonitor();
			await stopKeyboardShortcutMonitor();
			activeCursorSamples = [];
			pendingCursorSamples = [];
			activeKeystrokeEvents = [];
			pendingKeystrokeEvents = [];
			recordingClock = startRecordingClock(Date.now());
			recordingPaused = false;
			startCursorSamplingLoop();
			await startNativeInputMonitors();
		} else {
			stopCursorCapture();
			await stopMouseClickMonitor();
			await stopKeyboardShortcutMonitor();
			pendingCursorSamples = [...activeCursorSamples].sort((a, b) => a.timeMs - b.timeMs);
			pendingKeystrokeEvents = [...activeKeystrokeEvents].sort((a, b) => a.timeMs - b.timeMs);
			activeCursorSamples = [];
			activeKeystrokeEvents = [];
			recordingClock = null;
			recordingPaused = false;
		}

		const source = selectedSource || { name: "Screen" };
		if (onRecordingStateChange) {
			onRecordingStateChange(recording, source.name, recordingPaused);
		}
	});

	ipcMain.handle("set-recording-paused", async (_, paused: boolean) => {
		if (!recordingClock) {
			return;
		}

		if (paused && !recordingPaused) {
			recordingClock = pauseRecordingClock(recordingClock, Date.now());
			recordingPaused = true;
			stopCursorCapture();
			await stopMouseClickMonitor();
			await stopKeyboardShortcutMonitor();
		} else if (!paused && recordingPaused) {
			recordingClock = resumeRecordingClock(recordingClock, Date.now());
			recordingPaused = false;
			startCursorSamplingLoop();
			await startNativeInputMonitors();
		}

		const source = selectedSource || { name: "Screen" };
		onRecordingStateChange?.(true, source.name, recordingPaused);
	});

	ipcMain.handle("get-cursor-telemetry", async (_, videoPath?: string) => {
		const targetVideoPath = videoPath ?? currentVideoPath;
		if (!targetVideoPath) {
			return { success: true, samples: [] };
		}

		const telemetryPath = `${targetVideoPath}.cursor.json`;
		try {
			const content = await fs.readFile(telemetryPath, "utf-8");
			const parsed = JSON.parse(content);
			const rawSamples = Array.isArray(parsed)
				? parsed
				: Array.isArray(parsed?.samples)
					? parsed.samples
					: [];

			const samples: CursorTelemetryPoint[] = repairLegacyNativeClickScale(
				rawSamples
					.filter((sample: unknown) => Boolean(sample && typeof sample === "object"))
					.map((sample: unknown) => {
						const point = sample as Partial<CursorTelemetryPoint>;
						return {
							timeMs:
								typeof point.timeMs === "number" && Number.isFinite(point.timeMs)
									? Math.max(0, point.timeMs)
									: 0,
							cx:
								typeof point.cx === "number" && Number.isFinite(point.cx)
									? clamp(point.cx, 0, 1)
									: 0.5,
							cy:
								typeof point.cy === "number" && Number.isFinite(point.cy)
									? clamp(point.cy, 0, 1)
									: 0.5,
							kind: point.kind === "click" ? "click" : "move",
							button:
								point.button === "left" ||
								point.button === "right" ||
								point.button === "middle" ||
								point.button === "other"
									? point.button
									: undefined,
							phase: point.phase === "down" || point.phase === "up" ? point.phase : undefined,
							source: point.source === "native" ? "native" : "sampled",
						};
					})
					.sort((a: CursorTelemetryPoint, b: CursorTelemetryPoint) => a.timeMs - b.timeMs),
			);

			return { success: true, samples };
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") {
				return { success: true, samples: [] };
			}
			console.error("Failed to load cursor telemetry:", error);
			return {
				success: false,
				message: "Failed to load cursor telemetry",
				error: String(error),
				samples: [],
			};
		}
	});

	ipcMain.handle("get-keystroke-telemetry", async (_, videoPath?: string) => {
		const targetVideoPath = videoPath ?? currentVideoPath;
		if (!targetVideoPath) {
			return { success: true, events: [] };
		}

		const telemetryPath = getKeystrokeTelemetryPath(targetVideoPath);
		try {
			const content = await fs.readFile(telemetryPath, "utf-8");
			const parsed = JSON.parse(content);
			const rawEvents = Array.isArray(parsed)
				? parsed
				: Array.isArray(parsed?.events)
					? parsed.events
					: [];

			const events: KeystrokeTelemetryEvent[] = rawEvents
				.filter((event: unknown) => Boolean(event && typeof event === "object"))
				.map((event: unknown) => {
					const candidate = event as Partial<KeystrokeTelemetryEvent>;
					return {
						timeMs:
							typeof candidate.timeMs === "number" && Number.isFinite(candidate.timeMs)
								? Math.max(0, candidate.timeMs)
								: 0,
						text:
							typeof candidate.text === "string" && candidate.text.trim().length > 0
								? candidate.text.slice(0, MAX_KEYSTROKE_CUE_LENGTH)
								: "",
						source: candidate.source === "native" ? "native" : undefined,
					};
				})
				.filter((event: KeystrokeTelemetryEvent) => event.text.length > 0)
				.sort((a: KeystrokeTelemetryEvent, b: KeystrokeTelemetryEvent) => a.timeMs - b.timeMs);

			return { success: true, events };
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") {
				return { success: true, events: [] };
			}
			console.error("Failed to load keystroke telemetry:", error);
			return {
				success: false,
				message: "Failed to load keystroke telemetry",
				error: String(error),
				events: [],
			};
		}
	});

	ipcMain.handle("get-native-click-capture-status", async () => {
		return await getNativeClickCaptureStatus();
	});

	ipcMain.handle("request-native-click-capture-access", async () => {
		return await requestNativeClickCaptureAccess();
	});

	ipcMain.handle("open-native-click-capture-settings", async () => {
		try {
			if (process.platform === "darwin") {
				await shell.openExternal(
					"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
				);
				return { success: true };
			}

			return {
				success: false,
				error: "Native click capture settings are only available on macOS.",
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	ipcMain.handle("set-smart-demo-mode", (_, value: boolean) => {
		smartDemoMode = value;
		return { success: true };
	});

	ipcMain.handle("get-smart-demo-mode", () => {
		const value = smartDemoMode;
		smartDemoMode = false; // consume the flag
		return { value };
	});

	ipcMain.handle("get-ai-config", async () => {
		return await getPublicAIConfigResult();
	});

	ipcMain.handle("save-ai-config", async (_, input: unknown) => {
		return await saveAIConfigResult(input);
	});

	ipcMain.handle("clear-ai-config", async () => {
		return await clearAIConfigResult();
	});

	ipcMain.handle("test-ai-connection", async () => {
		return await testStoredAIConnection();
	});

	ipcMain.handle("run-smart-demo-ai-analysis", async (_, input: unknown) => {
		return await runSmartDemoAIAnalysis(input);
	});

	ipcMain.handle("list-ollama-models", async (_, input: unknown) => {
		return await fetchOllamaModels(input);
	});

	ipcMain.handle("get-transcription-config", async () => {
		return await getTranscriptionConfigResult();
	});

	ipcMain.handle("save-transcription-config", async (_, input: unknown) => {
		return await saveTranscriptionConfigResult(input);
	});

	ipcMain.handle("list-transcription-providers", async () => {
		const result = await getTranscriptionProviderOptionsResult();
		console.log("[ipc] list-transcription-providers result:", JSON.stringify(result));
		return result;
	});

	ipcMain.handle("open-transcript-file-picker", async () => {
		try {
			const result = await dialog.showOpenDialog({
				title: "Import Transcript",
				defaultPath: RECORDINGS_DIR,
				filters: [
					{ name: "Transcript Files", extensions: ["json", "vtt", "srt", "txt"] },
					{ name: "All Files", extensions: ["*"] },
				],
				properties: ["openFile"],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false, canceled: true };
			}

			const filePath = result.filePaths[0];
			return {
				success: true,
				data: {
					path: filePath,
					name: path.basename(filePath),
					content: await fs.readFile(filePath, "utf-8"),
				},
			};
		} catch (error) {
			console.error("Failed to import transcript file:", error);
			return {
				success: false,
				error: String(error),
			};
		}
	});

	ipcMain.handle("transcribe-video-audio", async (_, input: unknown) => {
		return await transcribeVideoResult(input);
	});

	ipcMain.handle("open-external-url", async (_, url: string) => {
		try {
			await shell.openExternal(url);
			return { success: true };
		} catch (error) {
			console.error("Failed to open URL:", error);
			return { success: false, error: String(error) };
		}
	});

	// Return base path for assets so renderer can resolve file:// paths in production
	ipcMain.handle("get-asset-base-path", () => {
		try {
			if (app.isPackaged) {
				return path.join(process.resourcesPath, "assets");
			}
			return path.join(app.getAppPath(), "public", "assets");
		} catch (err) {
			console.error("Failed to resolve asset base path:", err);
			return null;
		}
	});

	ipcMain.handle("save-exported-video", async (_, videoData: ArrayBuffer, fileName: string) => {
		try {
			// Determine file type from extension
			const isGif = fileName.toLowerCase().endsWith(".gif");
			const filters = isGif
				? [{ name: "GIF Image", extensions: ["gif"] }]
				: [{ name: "MP4 Video", extensions: ["mp4"] }];

			const result = await dialog.showSaveDialog({
				title: isGif ? "Save Exported GIF" : "Save Exported Video",
				defaultPath: path.join(app.getPath("downloads"), fileName),
				filters,
				properties: ["createDirectory", "showOverwriteConfirmation"],
			});

			if (result.canceled || !result.filePath) {
				return {
					success: false,
					canceled: true,
					message: "Export canceled",
				};
			}

			await fs.writeFile(result.filePath, Buffer.from(videoData));

			return {
				success: true,
				path: result.filePath,
				message: "Video exported successfully",
			};
		} catch (error) {
			console.error("Failed to save exported video:", error);
			return {
				success: false,
				message: "Failed to save exported video",
				error: String(error),
			};
		}
	});

	ipcMain.handle("save-exported-text", async (_, contents: string, fileName: string) => {
		try {
			const lowerFileName = fileName.toLowerCase();
			const filters = lowerFileName.endsWith(".vtt")
				? [{ name: "WebVTT Subtitle", extensions: ["vtt"] }]
				: lowerFileName.endsWith(".srt")
					? [{ name: "SubRip Subtitle", extensions: ["srt"] }]
					: [{ name: "Text File", extensions: ["txt"] }];

			const result = await dialog.showSaveDialog({
				title: "Save Transcript Export",
				defaultPath: path.join(app.getPath("downloads"), fileName),
				filters,
				properties: ["createDirectory", "showOverwriteConfirmation"],
			});

			if (result.canceled || !result.filePath) {
				return {
					success: false,
					canceled: true,
					message: "Export canceled",
				};
			}

			await fs.writeFile(result.filePath, contents, "utf-8");
			return {
				success: true,
				path: result.filePath,
				message: "Text exported successfully",
			};
		} catch (error) {
			console.error("Failed to save exported text:", error);
			return {
				success: false,
				message: "Failed to save exported text",
				error: String(error),
			};
		}
	});

	ipcMain.handle("open-video-file-picker", async () => {
		try {
			const result = await dialog.showOpenDialog({
				title: "Select Video File",
				defaultPath: RECORDINGS_DIR,
				filters: [
					{ name: "Video Files", extensions: ["webm", "mp4", "mov", "avi", "mkv"] },
					{ name: "All Files", extensions: ["*"] },
				],
				properties: ["openFile"],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false, canceled: true };
			}

			currentProjectPath = null;
			return {
				success: true,
				path: result.filePaths[0],
			};
		} catch (error) {
			console.error("Failed to open file picker:", error);
			return {
				success: false,
				message: "Failed to open file picker",
				error: String(error),
			};
		}
	});

	ipcMain.handle("reveal-in-folder", async (_, filePath: string) => {
		try {
			// shell.showItemInFolder doesn't return a value, it throws on error
			shell.showItemInFolder(filePath);
			return { success: true };
		} catch (error) {
			console.error(`Error revealing item in folder: ${filePath}`, error);
			// Fallback to open the directory if revealing the item fails
			// This might happen if the file was moved or deleted after export,
			// or if the path is somehow invalid for showItemInFolder
			try {
				const openPathResult = await shell.openPath(path.dirname(filePath));
				if (openPathResult) {
					// openPath returned an error message
					return { success: false, error: openPathResult };
				}
				return { success: true, message: "Could not reveal item, but opened directory." };
			} catch (openError) {
				console.error(`Error opening directory: ${path.dirname(filePath)}`, openError);
				return { success: false, error: String(error) };
			}
		}
	});

	ipcMain.handle(
		"save-project-file",
		async (_, projectData: unknown, suggestedName?: string, existingProjectPath?: string) => {
			try {
				const trustedExistingProjectPath = isTrustedProjectPath(existingProjectPath)
					? existingProjectPath
					: null;

				if (trustedExistingProjectPath) {
					await fs.writeFile(
						trustedExistingProjectPath,
						JSON.stringify(projectData, null, 2),
						"utf-8",
					);
					currentProjectPath = trustedExistingProjectPath;
					return {
						success: true,
						path: trustedExistingProjectPath,
						message: "Project saved successfully",
					};
				}

				const safeName = (suggestedName || `project-${Date.now()}`).replace(/[^a-zA-Z0-9-_]/g, "_");
				const defaultName = safeName.endsWith(`.${PROJECT_FILE_EXTENSION}`)
					? safeName
					: `${safeName}.${PROJECT_FILE_EXTENSION}`;

				const result = await dialog.showSaveDialog({
					title: "Save OpenScreen Project",
					defaultPath: path.join(RECORDINGS_DIR, defaultName),
					filters: [
						{ name: "OpenScreen Project", extensions: [PROJECT_FILE_EXTENSION] },
						{ name: "JSON", extensions: ["json"] },
					],
					properties: ["createDirectory", "showOverwriteConfirmation"],
				});

				if (result.canceled || !result.filePath) {
					return {
						success: false,
						canceled: true,
						message: "Save project canceled",
					};
				}

				await fs.writeFile(result.filePath, JSON.stringify(projectData, null, 2), "utf-8");
				currentProjectPath = result.filePath;

				return {
					success: true,
					path: result.filePath,
					message: "Project saved successfully",
				};
			} catch (error) {
				console.error("Failed to save project file:", error);
				return {
					success: false,
					message: "Failed to save project file",
					error: String(error),
				};
			}
		},
	);

	ipcMain.handle("load-project-file", async () => {
		try {
			const result = await dialog.showOpenDialog({
				title: "Open OpenScreen Project",
				defaultPath: RECORDINGS_DIR,
				filters: [
					{ name: "OpenScreen Project", extensions: [PROJECT_FILE_EXTENSION] },
					{ name: "JSON", extensions: ["json"] },
					{ name: "All Files", extensions: ["*"] },
				],
				properties: ["openFile"],
			});

			if (result.canceled || result.filePaths.length === 0) {
				return { success: false, canceled: true, message: "Open project canceled" };
			}

			const filePath = result.filePaths[0];
			const content = await fs.readFile(filePath, "utf-8");
			const project = JSON.parse(content);
			currentProjectPath = filePath;
			if (project && typeof project === "object" && typeof project.videoPath === "string") {
				currentVideoPath = project.videoPath;
			}

			return {
				success: true,
				path: filePath,
				project,
			};
		} catch (error) {
			console.error("Failed to load project file:", error);
			return {
				success: false,
				message: "Failed to load project file",
				error: String(error),
			};
		}
	});

	ipcMain.handle("load-current-project-file", async () => {
		try {
			if (!currentProjectPath) {
				return { success: false, message: "No active project" };
			}

			const content = await fs.readFile(currentProjectPath, "utf-8");
			const project = JSON.parse(content);
			if (project && typeof project === "object" && typeof project.videoPath === "string") {
				currentVideoPath = project.videoPath;
			}
			return {
				success: true,
				path: currentProjectPath,
				project,
			};
		} catch (error) {
			console.error("Failed to load current project file:", error);
			return {
				success: false,
				message: "Failed to load current project file",
				error: String(error),
			};
		}
	});
	ipcMain.handle("set-current-video-path", (_, path: string) => {
		currentVideoPath = path;
		currentProjectPath = null;
		return { success: true };
	});

	ipcMain.handle("get-current-video-path", async () => {
		if (!currentVideoPath) return { success: false };
		const sidecarPath = getTranscriptionAudioSidecarPath(currentVideoPath);
		let hasSidecar = false;
		try {
			await fs.access(sidecarPath);
			hasSidecar = true;
		} catch {
			hasSidecar = false;
		}
		return { success: true, path: currentVideoPath, hasSidecar };
	});

	ipcMain.handle("clear-current-video-path", () => {
		currentVideoPath = null;
		return { success: true };
	});

	ipcMain.handle("get-platform", () => {
		return process.platform;
	});

	ipcMain.handle("get-shortcuts", async () => {
		try {
			const data = await fs.readFile(SHORTCUTS_FILE, "utf-8");
			return JSON.parse(data);
		} catch {
			return null;
		}
	});

	ipcMain.handle("save-shortcuts", async (_, shortcuts: unknown) => {
		try {
			await fs.writeFile(SHORTCUTS_FILE, JSON.stringify(shortcuts, null, 2), "utf-8");
			return { success: true };
		} catch (error) {
			console.error("Failed to save shortcuts:", error);
			return { success: false, error: String(error) };
		}
	});
}
