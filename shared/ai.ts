export type AIProviderId = "openai" | "ollama";
export type TranscriptionProviderId = "auto" | "macos-native" | "openai";

export interface PublicAIConfig {
	provider: AIProviderId;
	model: string;
	baseUrl?: string;
	enabled: boolean;
	hasKey: boolean;
	useVision: boolean;
}

export interface SaveAIConfigInput {
	provider: AIProviderId;
	model: string;
	apiKey: string;
	baseUrl?: string;
	enabled: boolean;
	useVision: boolean;
}

export interface ResolvedAIConfig {
	provider: AIProviderId;
	model: string;
	apiKey?: string;
	baseUrl?: string;
	enabled: boolean;
	useVision: boolean;
}

export interface PublicTranscriptionConfig {
	provider: TranscriptionProviderId;
	enabled: boolean;
}

export interface SaveTranscriptionConfigInput {
	provider: TranscriptionProviderId;
	enabled: boolean;
}

export interface TranscriptionProviderOption {
	id: TranscriptionProviderId;
	label: string;
	available: boolean;
	reason?: string;
}

export interface OllamaModelListRequest {
	baseUrl?: string;
	apiKey?: string;
}

export interface OllamaModelSummary {
	name: string;
	sizeBytes: number;
	family?: string;
	parameterSize?: string;
	quantizationLevel?: string;
	modifiedAt?: string;
}

export interface TranscriptSegment {
	id: string;
	startMs: number;
	endMs: number;
	text: string;
	speaker?: string;
	confidence?: number;
}

export interface SpeechWindow {
	id: string;
	startMs: number;
	endMs: number;
	text: string;
	speakers: string[];
	averageConfidence?: number;
	segmentIds: string[];
}

export interface TranscriptSanityWarning {
	id: string;
	severity: "warning" | "error";
	message: string;
}

export interface ImportedTranscriptFile {
	path: string;
	name: string;
	content: string;
}

export interface SmartDemoAIFrameSample {
	timestampMs: number;
	mimeType: "image/jpeg";
	dataUrl: string;
}

export interface SmartDemoAILocalStep {
	timestampMs: number;
	title: string;
	description: string;
}

export interface SmartDemoAIAnalysisRequest {
	provider: AIProviderId;
	model: string;
	userPrompt: string;
	durationMs: number;
	sampledFrames: SmartDemoAIFrameSample[];
	transcriptSegments: TranscriptSegment[];
	speechWindows: SpeechWindow[];
	localAnalysis: {
		steps: SmartDemoAILocalStep[];
		clicks: number;
		silences: number;
		zooms: number;
		transcriptWarnings: TranscriptSanityWarning[];
		speechAnchors: SmartDemoAISpeechAnchor[];
		narrationLinkedZooms: SmartDemoAINarrationLinkedZoomSuggestion[];
		focusMoments: SmartDemoAIFocusMoment[];
	};
}

export interface SmartDemoAIStep {
	id: string;
	timestampMs: number;
	title: string;
	description: string;
	confidence: number;
}

export interface SmartDemoAIZoomSuggestion {
	id: string;
	startMs: number;
	endMs: number;
	focus: {
		cx: number;
		cy: number;
	};
	depth: 1 | 2 | 3 | 4 | 5 | 6;
	reason: string;
}

export interface SmartDemoAITrimSuggestion {
	id: string;
	startMs: number;
	endMs: number;
	reason: string;
}

export interface SmartDemoAISpeechAnchor {
	id: string;
	startMs: number;
	endMs: number;
	text: string;
	referencedTarget?: string;
	confidence: number;
}

export interface SmartDemoAINarrationLinkedZoomSuggestion extends SmartDemoAIZoomSuggestion {
	anchorId?: string;
}

export interface SmartDemoAIFocusMoment {
	id: string;
	timestampMs: number;
	title: string;
	reason: string;
	anchorId?: string;
	confidence: number;
}

export interface SmartDemoAISuggestion {
	summary: string;
	steps: SmartDemoAIStep[];
	zooms: SmartDemoAIZoomSuggestion[];
	trims: SmartDemoAITrimSuggestion[];
	speechAnchors: SmartDemoAISpeechAnchor[];
	narrationLinkedZooms: SmartDemoAINarrationLinkedZoomSuggestion[];
	focusMoments: SmartDemoAIFocusMoment[];
}

export interface AIResult<T> {
	success: boolean;
	data?: T;
	error?: string;
}

const AI_PROVIDERS: AIProviderId[] = ["openai", "ollama"];
const TRANSCRIPTION_PROVIDERS: TranscriptionProviderId[] = ["auto", "macos-native", "openai"];
const ZOOM_DEPTHS = new Set([1, 2, 3, 4, 5, 6]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function asNonEmptyString(value: unknown): string | null {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function asFiniteNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function isAIProviderId(value: unknown): value is AIProviderId {
	return typeof value === "string" && AI_PROVIDERS.includes(value as AIProviderId);
}

export function isTranscriptionProviderId(value: unknown): value is TranscriptionProviderId {
	return (
		typeof value === "string" && TRANSCRIPTION_PROVIDERS.includes(value as TranscriptionProviderId)
	);
}

export function normalizeSaveAIConfigInput(candidate: unknown): SaveAIConfigInput | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const provider = candidate.provider;
	const model = asNonEmptyString(candidate.model);
	const rawApiKey = typeof candidate.apiKey === "string" ? candidate.apiKey.trim() : null;
	if (
		!isAIProviderId(provider) ||
		!model ||
		rawApiKey === null ||
		typeof candidate.enabled !== "boolean" ||
		typeof candidate.useVision !== "boolean"
	) {
		return null;
	}

	return {
		provider,
		model,
		apiKey: rawApiKey,
		baseUrl: asOptionalString(candidate.baseUrl),
		enabled: candidate.enabled,
		useVision: candidate.useVision,
	};
}

export function normalizeSaveTranscriptionConfigInput(
	candidate: unknown,
): SaveTranscriptionConfigInput | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const provider = candidate.provider;
	if (!isTranscriptionProviderId(provider) || typeof candidate.enabled !== "boolean") {
		return null;
	}

	return {
		provider,
		enabled: candidate.enabled,
	};
}

export function toPublicAIConfig(config: ResolvedAIConfig): PublicAIConfig {
	return {
		provider: config.provider,
		model: config.model,
		baseUrl: config.baseUrl,
		enabled: config.enabled,
		hasKey: typeof config.apiKey === "string" && config.apiKey.trim().length > 0,
		useVision: config.useVision,
	};
}

export function normalizePublicAIConfig(candidate: unknown): PublicAIConfig | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const provider = candidate.provider;
	const model = asNonEmptyString(candidate.model);
	if (
		!isAIProviderId(provider) ||
		!model ||
		typeof candidate.enabled !== "boolean" ||
		typeof candidate.hasKey !== "boolean"
	) {
		return null;
	}

	return {
		provider,
		model,
		baseUrl: asOptionalString(candidate.baseUrl),
		enabled: candidate.enabled,
		hasKey: candidate.hasKey,
		useVision: typeof candidate.useVision === "boolean" ? candidate.useVision : false,
	};
}

export function normalizeResolvedAIConfig(candidate: unknown): ResolvedAIConfig | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const provider = candidate.provider;
	const model = asNonEmptyString(candidate.model);
	const apiKey = asOptionalString(candidate.apiKey);
	if (!isAIProviderId(provider) || !model || typeof candidate.enabled !== "boolean") {
		return null;
	}

	if (provider === "openai" && !apiKey) {
		return null;
	}

	return {
		provider,
		model,
		apiKey,
		baseUrl: asOptionalString(candidate.baseUrl),
		enabled: candidate.enabled,
		useVision: typeof candidate.useVision === "boolean" ? candidate.useVision : false,
	};
}

export function normalizePublicTranscriptionConfig(
	candidate: unknown,
): PublicTranscriptionConfig | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const provider = candidate.provider;
	if (!isTranscriptionProviderId(provider) || typeof candidate.enabled !== "boolean") {
		return null;
	}

	return {
		provider,
		enabled: candidate.enabled,
	};
}

function normalizeFrameSample(candidate: unknown): SmartDemoAIFrameSample | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const timestampMs = asFiniteNumber(candidate.timestampMs);
	const dataUrl = asNonEmptyString(candidate.dataUrl);
	if (timestampMs === null || !dataUrl || candidate.mimeType !== "image/jpeg") {
		return null;
	}

	return {
		timestampMs: Math.max(0, Math.round(timestampMs)),
		mimeType: "image/jpeg",
		dataUrl,
	};
}

function normalizeLocalStep(candidate: unknown): SmartDemoAILocalStep | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const timestampMs = asFiniteNumber(candidate.timestampMs);
	const title = asNonEmptyString(candidate.title);
	const description = asNonEmptyString(candidate.description);
	if (timestampMs === null || !title || !description) {
		return null;
	}

	return {
		timestampMs: Math.max(0, Math.round(timestampMs)),
		title,
		description,
	};
}

export function normalizeTranscriptSegment(
	candidate: unknown,
	index = 0,
): TranscriptSegment | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const startMs = asFiniteNumber(candidate.startMs);
	const endMs = asFiniteNumber(candidate.endMs);
	const text = asNonEmptyString(candidate.text);
	const confidence = asFiniteNumber(candidate.confidence);
	if (startMs === null || endMs === null || !text) {
		return null;
	}

	const normalizedStartMs = Math.max(0, Math.round(startMs));
	const normalizedEndMs = Math.max(normalizedStartMs + 1, Math.round(endMs));

	return {
		id: asNonEmptyString(candidate.id) ?? `transcript-${index + 1}`,
		startMs: normalizedStartMs,
		endMs: normalizedEndMs,
		text,
		speaker: asOptionalString(candidate.speaker),
		confidence: confidence === null ? undefined : clamp(confidence, 0, 1),
	};
}

export function normalizeSpeechWindow(candidate: unknown, index = 0): SpeechWindow | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const startMs = asFiniteNumber(candidate.startMs);
	const endMs = asFiniteNumber(candidate.endMs);
	const text = asNonEmptyString(candidate.text);
	if (startMs === null || endMs === null || !text) {
		return null;
	}

	const speakers = Array.isArray(candidate.speakers)
		? candidate.speakers
				.map((speaker) => asNonEmptyString(speaker))
				.filter((speaker): speaker is string => speaker !== null)
		: [];
	const segmentIds = Array.isArray(candidate.segmentIds)
		? candidate.segmentIds
				.map((segmentId) => asNonEmptyString(segmentId))
				.filter((segmentId): segmentId is string => segmentId !== null)
		: [];
	const averageConfidence = asFiniteNumber(candidate.averageConfidence);
	const normalizedStartMs = Math.max(0, Math.round(startMs));
	const normalizedEndMs = Math.max(normalizedStartMs + 1, Math.round(endMs));

	return {
		id: asNonEmptyString(candidate.id) ?? `speech-window-${index + 1}`,
		startMs: normalizedStartMs,
		endMs: normalizedEndMs,
		text,
		speakers,
		segmentIds,
		averageConfidence: averageConfidence === null ? undefined : clamp(averageConfidence, 0, 1),
	};
}

export function normalizeTranscriptSanityWarning(
	candidate: unknown,
	index = 0,
): TranscriptSanityWarning | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const message = asNonEmptyString(candidate.message);
	const severity = candidate.severity;
	if (!message || (severity !== "warning" && severity !== "error")) {
		return null;
	}

	return {
		id: asNonEmptyString(candidate.id) ?? `transcript-warning-${index + 1}`,
		severity,
		message,
	};
}

function normalizeSpeechAnchor(candidate: unknown, index: number): SmartDemoAISpeechAnchor | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const startMs = asFiniteNumber(candidate.startMs);
	const endMs = asFiniteNumber(candidate.endMs);
	const text = asNonEmptyString(candidate.text);
	const confidence = asFiniteNumber(candidate.confidence);
	if (startMs === null || endMs === null || !text || confidence === null) {
		return null;
	}

	const normalizedStartMs = Math.max(0, Math.round(startMs));
	const normalizedEndMs = Math.max(normalizedStartMs + 1, Math.round(endMs));

	return {
		id: asNonEmptyString(candidate.id) ?? `ai-anchor-${index + 1}`,
		startMs: normalizedStartMs,
		endMs: normalizedEndMs,
		text,
		referencedTarget: asOptionalString(candidate.referencedTarget),
		confidence: clamp(confidence, 0, 1),
	};
}

function normalizeFocusMoment(candidate: unknown, index: number): SmartDemoAIFocusMoment | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const timestampMs = asFiniteNumber(candidate.timestampMs);
	const title = asNonEmptyString(candidate.title);
	const reason = asNonEmptyString(candidate.reason);
	const confidence = asFiniteNumber(candidate.confidence);
	if (timestampMs === null || !title || !reason || confidence === null) {
		return null;
	}

	return {
		id: asNonEmptyString(candidate.id) ?? `ai-focus-${index + 1}`,
		timestampMs: Math.max(0, Math.round(timestampMs)),
		title,
		reason,
		anchorId: asOptionalString(candidate.anchorId),
		confidence: clamp(confidence, 0, 1),
	};
}

export function normalizeSmartDemoAIAnalysisRequest(
	candidate: unknown,
): SmartDemoAIAnalysisRequest | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const provider = candidate.provider;
	const model = asNonEmptyString(candidate.model);
	const userPrompt = typeof candidate.userPrompt === "string" ? candidate.userPrompt.trim() : "";
	const durationMs = asFiniteNumber(candidate.durationMs);
	const localAnalysis = candidate.localAnalysis;
	if (!isAIProviderId(provider) || !model || durationMs === null || !isRecord(localAnalysis)) {
		return null;
	}

	const sampledFrames = Array.isArray(candidate.sampledFrames)
		? candidate.sampledFrames
				.map((sample) => normalizeFrameSample(sample))
				.filter((sample): sample is SmartDemoAIFrameSample => sample !== null)
		: [];

	const transcriptSegments = Array.isArray(candidate.transcriptSegments)
		? candidate.transcriptSegments
				.map((segment, index) => normalizeTranscriptSegment(segment, index))
				.filter((segment): segment is TranscriptSegment => segment !== null)
		: [];

	const speechWindows = Array.isArray(candidate.speechWindows)
		? candidate.speechWindows
				.map((window, index) => normalizeSpeechWindow(window, index))
				.filter((window): window is SpeechWindow => window !== null)
		: [];

	const steps = Array.isArray(localAnalysis.steps)
		? localAnalysis.steps
				.map((step) => normalizeLocalStep(step))
				.filter((step): step is SmartDemoAILocalStep => step !== null)
		: [];

	const clicks = asFiniteNumber(localAnalysis.clicks);
	const silences = asFiniteNumber(localAnalysis.silences);
	const zooms = asFiniteNumber(localAnalysis.zooms);
	if (clicks === null || silences === null || zooms === null) {
		return null;
	}

	const transcriptWarnings = Array.isArray(localAnalysis.transcriptWarnings)
		? localAnalysis.transcriptWarnings
				.map((warning, index) => normalizeTranscriptSanityWarning(warning, index))
				.filter((warning): warning is TranscriptSanityWarning => warning !== null)
		: [];

	const speechAnchors = Array.isArray(localAnalysis.speechAnchors)
		? localAnalysis.speechAnchors
				.map((anchor, index) => normalizeSpeechAnchor(anchor, index))
				.filter((anchor): anchor is SmartDemoAISpeechAnchor => anchor !== null)
		: [];

	const narrationLinkedZooms = Array.isArray(localAnalysis.narrationLinkedZooms)
		? localAnalysis.narrationLinkedZooms
				.map((zoom, index) => normalizeNarrationLinkedZoom(zoom, index))
				.filter((zoom): zoom is SmartDemoAINarrationLinkedZoomSuggestion => zoom !== null)
		: [];

	const focusMoments = Array.isArray(localAnalysis.focusMoments)
		? localAnalysis.focusMoments
				.map((moment, index) => normalizeFocusMoment(moment, index))
				.filter((moment): moment is SmartDemoAIFocusMoment => moment !== null)
		: [];

	return {
		provider,
		model,
		userPrompt,
		durationMs: Math.max(0, Math.round(durationMs)),
		sampledFrames,
		transcriptSegments,
		speechWindows,
		localAnalysis: {
			steps,
			clicks: Math.max(0, Math.round(clicks)),
			silences: Math.max(0, Math.round(silences)),
			zooms: Math.max(0, Math.round(zooms)),
			transcriptWarnings,
			speechAnchors,
			narrationLinkedZooms,
			focusMoments,
		},
	};
}

function normalizeStep(candidate: unknown, index: number): SmartDemoAIStep | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const timestampMs = asFiniteNumber(candidate.timestampMs);
	const title = asNonEmptyString(candidate.title);
	const description = asNonEmptyString(candidate.description);
	const confidence = asFiniteNumber(candidate.confidence);
	if (timestampMs === null || !title || !description || confidence === null) {
		return null;
	}

	return {
		id: asNonEmptyString(candidate.id) ?? `ai-step-${index + 1}`,
		timestampMs: Math.max(0, Math.round(timestampMs)),
		title,
		description,
		confidence: clamp(confidence, 0, 1),
	};
}

function normalizeZoomBase(
	candidate: unknown,
	index: number,
	defaultPrefix: string,
): SmartDemoAIZoomSuggestion | null {
	if (!isRecord(candidate) || !isRecord(candidate.focus)) {
		return null;
	}

	const startMs = asFiniteNumber(candidate.startMs);
	const endMs = asFiniteNumber(candidate.endMs);
	const cx = asFiniteNumber(candidate.focus.cx);
	const cy = asFiniteNumber(candidate.focus.cy);
	const depth = asFiniteNumber(candidate.depth);
	const reason = asNonEmptyString(candidate.reason);
	if (
		startMs === null ||
		endMs === null ||
		cx === null ||
		cy === null ||
		depth === null ||
		!reason
	) {
		return null;
	}

	const normalizedDepth = Math.round(depth);
	if (!ZOOM_DEPTHS.has(normalizedDepth)) {
		return null;
	}

	const normalizedStartMs = Math.max(0, Math.round(startMs));
	const normalizedEndMs = Math.max(normalizedStartMs + 1, Math.round(endMs));

	return {
		id: asNonEmptyString(candidate.id) ?? `${defaultPrefix}-${index + 1}`,
		startMs: normalizedStartMs,
		endMs: normalizedEndMs,
		focus: {
			cx: clamp(cx, 0, 1),
			cy: clamp(cy, 0, 1),
		},
		depth: normalizedDepth as SmartDemoAIZoomSuggestion["depth"],
		reason,
	};
}

function normalizeZoom(candidate: unknown, index: number): SmartDemoAIZoomSuggestion | null {
	return normalizeZoomBase(candidate, index, "ai-zoom");
}

function normalizeNarrationLinkedZoom(
	candidate: unknown,
	index: number,
): SmartDemoAINarrationLinkedZoomSuggestion | null {
	const normalized = normalizeZoomBase(candidate, index, "ai-narration-zoom");
	if (!normalized || !isRecord(candidate)) {
		return null;
	}

	return {
		...normalized,
		anchorId: asOptionalString(candidate.anchorId),
	};
}

function normalizeTrim(candidate: unknown, index: number): SmartDemoAITrimSuggestion | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const startMs = asFiniteNumber(candidate.startMs);
	const endMs = asFiniteNumber(candidate.endMs);
	const reason = asNonEmptyString(candidate.reason);
	if (startMs === null || endMs === null || !reason) {
		return null;
	}

	const normalizedStartMs = Math.max(0, Math.round(startMs));
	const normalizedEndMs = Math.max(normalizedStartMs + 1, Math.round(endMs));

	return {
		id: asNonEmptyString(candidate.id) ?? `ai-trim-${index + 1}`,
		startMs: normalizedStartMs,
		endMs: normalizedEndMs,
		reason,
	};
}

export function normalizeSmartDemoAISuggestion(candidate: unknown): SmartDemoAISuggestion | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const summary = asNonEmptyString(candidate.summary);
	if (!summary) {
		return null;
	}

	const steps = Array.isArray(candidate.steps)
		? candidate.steps
				.map((step, index) => normalizeStep(step, index))
				.filter((step): step is SmartDemoAIStep => step !== null)
		: [];

	const zooms = Array.isArray(candidate.zooms)
		? candidate.zooms
				.map((zoom, index) => normalizeZoom(zoom, index))
				.filter((zoom): zoom is SmartDemoAIZoomSuggestion => zoom !== null)
		: [];

	const trims = Array.isArray(candidate.trims)
		? candidate.trims
				.map((trim, index) => normalizeTrim(trim, index))
				.filter((trim): trim is SmartDemoAITrimSuggestion => trim !== null)
		: [];

	const speechAnchors = Array.isArray(candidate.speechAnchors)
		? candidate.speechAnchors
				.map((anchor, index) => normalizeSpeechAnchor(anchor, index))
				.filter((anchor): anchor is SmartDemoAISpeechAnchor => anchor !== null)
		: [];

	const narrationLinkedZooms = Array.isArray(candidate.narrationLinkedZooms)
		? candidate.narrationLinkedZooms
				.map((zoom, index) => normalizeNarrationLinkedZoom(zoom, index))
				.filter((zoom): zoom is SmartDemoAINarrationLinkedZoomSuggestion => zoom !== null)
		: [];

	const focusMoments = Array.isArray(candidate.focusMoments)
		? candidate.focusMoments
				.map((moment, index) => normalizeFocusMoment(moment, index))
				.filter((moment): moment is SmartDemoAIFocusMoment => moment !== null)
		: [];

	return {
		summary,
		steps,
		zooms,
		trims,
		speechAnchors,
		narrationLinkedZooms,
		focusMoments,
	};
}

export function ok<T>(data: T): AIResult<T> {
	return { success: true, data };
}

export function err(error: string): AIResult<never> {
	return { success: false, error };
}

export function providerRequiresApiKey(provider: AIProviderId): boolean {
	return provider === "openai";
}

export function isAIConfigReady(
	config: Pick<PublicAIConfig, "provider" | "enabled" | "hasKey"> | null | undefined,
) {
	if (!config?.enabled) {
		return false;
	}

	if (providerRequiresApiKey(config.provider)) {
		return config.hasKey;
	}

	return true;
}

export function normalizeOllamaModelListRequest(candidate: unknown): OllamaModelListRequest {
	if (!isRecord(candidate)) {
		return {};
	}

	return {
		baseUrl: asOptionalString(candidate.baseUrl),
		apiKey: asOptionalString(candidate.apiKey),
	};
}

export function normalizeOllamaModelSummary(candidate: unknown): OllamaModelSummary | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const name = asNonEmptyString(candidate.name);
	const sizeBytes = asFiniteNumber(candidate.sizeBytes);
	if (!name || sizeBytes === null) {
		return null;
	}

	return {
		name,
		sizeBytes: Math.max(0, Math.round(sizeBytes)),
		family: asOptionalString(candidate.family),
		parameterSize: asOptionalString(candidate.parameterSize),
		quantizationLevel: asOptionalString(candidate.quantizationLevel),
		modifiedAt: asOptionalString(candidate.modifiedAt),
	};
}
