import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
	hudOverlayHide: () => {
		ipcRenderer.send("hud-overlay-hide");
	},
	hudOverlayClose: () => {
		ipcRenderer.send("hud-overlay-close");
	},
	getAssetBasePath: async () => {
		return await ipcRenderer.invoke("get-asset-base-path");
	},
	getSources: async (opts: Electron.SourcesOptions) => {
		return await ipcRenderer.invoke("get-sources", opts);
	},
	switchToEditor: () => {
		return ipcRenderer.invoke("switch-to-editor");
	},
	openSourceSelector: () => {
		return ipcRenderer.invoke("open-source-selector");
	},
	selectSource: (source: unknown) => {
		return ipcRenderer.invoke("select-source", source);
	},
	getSelectedSource: () => {
		return ipcRenderer.invoke("get-selected-source");
	},
	storeRecordedVideo: (videoData: ArrayBuffer, fileName: string) => {
		return ipcRenderer.invoke("store-recorded-video", videoData, fileName);
	},
	storeRecordedTranscriptionAudio: (audioData: ArrayBuffer, videoPath: string) => {
		return ipcRenderer.invoke("store-recorded-transcription-audio", audioData, videoPath);
	},
	getRecordedVideoPath: () => {
		return ipcRenderer.invoke("get-recorded-video-path");
	},
	setRecordingState: (recording: boolean) => {
		return ipcRenderer.invoke("set-recording-state", recording);
	},
	setRecordingPaused: (paused: boolean) => {
		return ipcRenderer.invoke("set-recording-paused", paused);
	},
	getCursorTelemetry: (videoPath?: string) => {
		return ipcRenderer.invoke("get-cursor-telemetry", videoPath);
	},
	getKeystrokeTelemetry: (videoPath?: string) => {
		return ipcRenderer.invoke("get-keystroke-telemetry", videoPath);
	},
	getNativeClickCaptureStatus: () => {
		return ipcRenderer.invoke("get-native-click-capture-status");
	},
	requestNativeClickCaptureAccess: () => {
		return ipcRenderer.invoke("request-native-click-capture-access");
	},
	openNativeClickCaptureSettings: () => {
		return ipcRenderer.invoke("open-native-click-capture-settings");
	},
	setSmartDemoMode: (value: boolean) => {
		return ipcRenderer.invoke("set-smart-demo-mode", value);
	},
	getSmartDemoMode: () => {
		return ipcRenderer.invoke("get-smart-demo-mode");
	},
	getAIConfig: () => {
		return ipcRenderer.invoke("get-ai-config");
	},
	saveAIConfig: (input: unknown) => {
		return ipcRenderer.invoke("save-ai-config", input);
	},
	clearAIConfig: () => {
		return ipcRenderer.invoke("clear-ai-config");
	},
	testAIConnection: () => {
		return ipcRenderer.invoke("test-ai-connection");
	},
	runSmartDemoAIAnalysis: (input: unknown) => {
		return ipcRenderer.invoke("run-smart-demo-ai-analysis", input);
	},
	listOllamaModels: (input: unknown) => {
		return ipcRenderer.invoke("list-ollama-models", input);
	},
	getTranscriptionConfig: () => {
		return ipcRenderer.invoke("get-transcription-config");
	},
	saveTranscriptionConfig: (input: unknown) => {
		return ipcRenderer.invoke("save-transcription-config", input);
	},
	listTranscriptionProviders: () => {
		return ipcRenderer.invoke("list-transcription-providers");
	},
	openTranscriptFilePicker: () => {
		return ipcRenderer.invoke("open-transcript-file-picker");
	},
	transcribeVideoAudio: (input: unknown) => {
		return ipcRenderer.invoke("transcribe-video-audio", input);
	},
	onStopRecordingFromTray: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("stop-recording-from-tray", listener);
		return () => ipcRenderer.removeListener("stop-recording-from-tray", listener);
	},
	onTogglePauseRecordingFromTray: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("toggle-pause-recording-from-tray", listener);
		return () => ipcRenderer.removeListener("toggle-pause-recording-from-tray", listener);
	},
	openExternalUrl: (url: string) => {
		return ipcRenderer.invoke("open-external-url", url);
	},
	saveExportedVideo: (videoData: ArrayBuffer, fileName: string) => {
		return ipcRenderer.invoke("save-exported-video", videoData, fileName);
	},
	saveExportedText: (contents: string, fileName: string) => {
		return ipcRenderer.invoke("save-exported-text", contents, fileName);
	},
	openVideoFilePicker: () => {
		return ipcRenderer.invoke("open-video-file-picker");
	},
	setCurrentVideoPath: (path: string) => {
		return ipcRenderer.invoke("set-current-video-path", path);
	},
	getCurrentVideoPath: () => {
		return ipcRenderer.invoke("get-current-video-path");
	},
	clearCurrentVideoPath: () => {
		return ipcRenderer.invoke("clear-current-video-path");
	},
	saveProjectFile: (projectData: unknown, suggestedName?: string, existingProjectPath?: string) => {
		return ipcRenderer.invoke("save-project-file", projectData, suggestedName, existingProjectPath);
	},
	loadProjectFile: () => {
		return ipcRenderer.invoke("load-project-file");
	},
	loadCurrentProjectFile: () => {
		return ipcRenderer.invoke("load-current-project-file");
	},
	onMenuLoadProject: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-load-project", listener);
		return () => ipcRenderer.removeListener("menu-load-project", listener);
	},
	onMenuSaveProject: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-save-project", listener);
		return () => ipcRenderer.removeListener("menu-save-project", listener);
	},
	onMenuSaveProjectAs: (callback: () => void) => {
		const listener = () => callback();
		ipcRenderer.on("menu-save-project-as", listener);
		return () => ipcRenderer.removeListener("menu-save-project-as", listener);
	},
	getPlatform: () => {
		return ipcRenderer.invoke("get-platform");
	},
	revealInFolder: (filePath: string) => {
		return ipcRenderer.invoke("reveal-in-folder", filePath);
	},
	getShortcuts: () => {
		return ipcRenderer.invoke("get-shortcuts");
	},
	saveShortcuts: (shortcuts: unknown) => {
		return ipcRenderer.invoke("save-shortcuts", shortcuts);
	},
});
