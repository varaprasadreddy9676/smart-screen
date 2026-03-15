/// <reference types="vite-plugin-electron/electron-env" />

import type {
	AIResult,
	ImportedTranscriptFile,
	OllamaModelListRequest,
	OllamaModelSummary,
	PublicAIConfig,
	PublicTranscriptionConfig,
	SaveAIConfigInput,
	SaveTranscriptionConfigInput,
	SmartDemoAIAnalysisRequest,
	SmartDemoAISuggestion,
	TranscriptSegment,
	TranscriptionProviderId,
	TranscriptionProviderOption,
} from "@shared/ai";

// biome-ignore lint/style/noNamespace: NodeJS standard declaration style
declare namespace NodeJS {
	interface ProcessEnv {
		/**
		 * The built directory structure
		 *
		 * ```tree
		 * ├─┬─┬ dist
		 * │ │ └── index.html
		 * │ │
		 * │ ├─┬ dist-electron
		 * │ │ ├── main.js
		 * │ │ └── preload.js
		 * │
		 * ```
		 */
		APP_ROOT: string;
		/** /dist/ or /public/ */
		VITE_PUBLIC: string;
	}
}

declare global {
	// Used in Renderer process, expose in `preload.ts`
	interface Window {
		electronAPI: {
			getSources: (opts: Electron.SourcesOptions) => Promise<ProcessedDesktopSource[]>;
			switchToEditor: () => Promise<void>;
			openSourceSelector: () => Promise<void>;
			selectSource: (source: unknown) => Promise<unknown>;
			getSelectedSource: () => Promise<unknown>;
			storeRecordedVideo: (
				videoData: ArrayBuffer,
				fileName: string,
			) => Promise<{ success: boolean; path?: string; message?: string }>;
			storeRecordedTranscriptionAudio: (
				audioData: ArrayBuffer,
				videoPath: string,
			) => Promise<{ success: boolean; path?: string; message?: string; error?: string }>;
			getRecordedVideoPath: () => Promise<{ success: boolean; path?: string; message?: string }>;
			setRecordingState: (recording: boolean) => Promise<void>;
			setRecordingPaused: (paused: boolean) => Promise<void>;
			getCursorTelemetry: (videoPath?: string) => Promise<{
				success: boolean;
				samples: CursorTelemetryPoint[];
				message?: string;
				error?: string;
			}>;
			getKeystrokeTelemetry: (videoPath?: string) => Promise<{
				success: boolean;
				events: KeystrokeTelemetryEvent[];
				message?: string;
				error?: string;
			}>;
			getNativeClickCaptureStatus: () => Promise<NativeClickCaptureStatus>;
			requestNativeClickCaptureAccess: () => Promise<NativeClickCaptureStatus>;
			openNativeClickCaptureSettings: () => Promise<{ success: boolean; error?: string }>;
			onStopRecordingFromTray: (callback: () => void) => () => void;
			onTogglePauseRecordingFromTray: (callback: () => void) => () => void;
			openExternalUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
			saveExportedVideo: (
				videoData: ArrayBuffer,
				fileName: string,
			) => Promise<{ success: boolean; path?: string; message?: string; canceled?: boolean }>;
			saveExportedText: (
				contents: string,
				fileName: string,
			) => Promise<{ success: boolean; path?: string; message?: string; canceled?: boolean }>;
			openVideoFilePicker: () => Promise<{ success: boolean; path?: string; canceled?: boolean }>;
			setCurrentVideoPath: (path: string) => Promise<{ success: boolean }>;
			getCurrentVideoPath: () => Promise<{ success: boolean; path?: string }>;
			clearCurrentVideoPath: () => Promise<{ success: boolean }>;
			saveProjectFile: (
				projectData: unknown,
				suggestedName?: string,
				existingProjectPath?: string,
			) => Promise<{
				success: boolean;
				path?: string;
				message?: string;
				canceled?: boolean;
				error?: string;
			}>;
			loadProjectFile: () => Promise<{
				success: boolean;
				path?: string;
				project?: unknown;
				message?: string;
				canceled?: boolean;
				error?: string;
			}>;
			loadCurrentProjectFile: () => Promise<{
				success: boolean;
				path?: string;
				project?: unknown;
				message?: string;
				canceled?: boolean;
				error?: string;
			}>;
			onMenuLoadProject: (callback: () => void) => () => void;
			onMenuSaveProject: (callback: () => void) => () => void;
			onMenuSaveProjectAs: (callback: () => void) => () => void;
			getPlatform: () => Promise<string>;
			revealInFolder: (
				filePath: string,
			) => Promise<{ success: boolean; error?: string; message?: string }>;
			getShortcuts: () => Promise<Record<string, unknown> | null>;
			saveShortcuts: (shortcuts: unknown) => Promise<{ success: boolean; error?: string }>;
			getAssetBasePath: () => Promise<string | null>;
			hudOverlayHide: () => void;
			hudOverlayClose: () => void;
			setSmartDemoMode: (value: boolean) => Promise<{ success: boolean }>;
			getSmartDemoMode: () => Promise<{ value: boolean }>;
			getAIConfig: () => Promise<AIResult<PublicAIConfig | null>>;
			saveAIConfig: (input: SaveAIConfigInput) => Promise<AIResult<PublicAIConfig>>;
			clearAIConfig: () => Promise<AIResult<true>>;
			testAIConnection: () => Promise<AIResult<true>>;
			runSmartDemoAIAnalysis: (
				input: SmartDemoAIAnalysisRequest,
			) => Promise<AIResult<SmartDemoAISuggestion>>;
			listOllamaModels: (input?: OllamaModelListRequest) => Promise<AIResult<OllamaModelSummary[]>>;
			getTranscriptionConfig: () => Promise<AIResult<PublicTranscriptionConfig>>;
			saveTranscriptionConfig: (
				input: SaveTranscriptionConfigInput,
			) => Promise<AIResult<PublicTranscriptionConfig>>;
			listTranscriptionProviders: () => Promise<AIResult<TranscriptionProviderOption[]>>;
			openTranscriptFilePicker: () => Promise<
				AIResult<ImportedTranscriptFile> & { canceled?: boolean }
			>;
			transcribeVideoAudio: (input: {
				videoPath: string;
				provider?: TranscriptionProviderId;
			}) => Promise<AIResult<TranscriptSegment[]>>;
		};
	}
}

interface ProcessedDesktopSource {
	id: string;
	name: string;
	display_id: string;
	thumbnail: string | null;
	appIcon: string | null;
}

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

interface NativeClickCaptureStatus {
	supported: boolean;
	helperAvailable: boolean;
	permissionGranted: boolean;
	reason?: string;
}

export {};
