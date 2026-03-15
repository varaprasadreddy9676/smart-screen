import type { SmartDemoAIAnalysisRequest } from "../../shared/ai";

function formatLocalSteps(request: SmartDemoAIAnalysisRequest) {
	const steps = request.localAnalysis.steps ?? [];
	if (steps.length === 0) {
		return "No local steps were detected.";
	}

	return steps
		.map(
			(step, index) => `${index + 1}. @${step.timestampMs}ms | ${step.title} | ${step.description}`,
		)
		.join("\n");
}

function formatFrameHints(request: SmartDemoAIAnalysisRequest) {
	const sampledFrames = request.sampledFrames ?? [];
	if (sampledFrames.length === 0) {
		return "No frame samples were provided.";
	}

	return sampledFrames
		.map((frame, index) => `Frame ${index + 1}: timestamp=${frame.timestampMs}ms`)
		.join("\n");
}

function formatTranscriptSegments(request: SmartDemoAIAnalysisRequest) {
	const transcriptSegments = request.transcriptSegments ?? [];
	if (transcriptSegments.length === 0) {
		return "No transcript segments were provided.";
	}

	return transcriptSegments
		.map((segment) => {
			const confidence =
				typeof segment.confidence === "number"
					? ` | confidence=${segment.confidence.toFixed(2)}`
					: "";
			const speaker = segment.speaker ? ` | speaker=${segment.speaker}` : "";
			return `@${segment.startMs}-${segment.endMs}ms${speaker}${confidence} | ${segment.text}`;
		})
		.join("\n");
}

function formatSpeechWindows(request: SmartDemoAIAnalysisRequest) {
	const speechWindows = request.speechWindows ?? [];
	if (speechWindows.length === 0) {
		return "No grouped speech windows were provided.";
	}

	return speechWindows
		.map((window, index) => {
			const speakers = window.speakers.length > 0 ? window.speakers.join(", ") : "unknown";
			return `${index + 1}. @${window.startMs}-${window.endMs}ms | speakers=${speakers} | ${window.text}`;
		})
		.join("\n");
}

function formatTranscriptWarnings(request: SmartDemoAIAnalysisRequest) {
	const warnings = request.localAnalysis.transcriptWarnings ?? [];
	if (warnings.length === 0) {
		return "No local transcript mismatch warnings were detected.";
	}

	return warnings
		.map((warning) => `${warning.severity.toUpperCase()}: ${warning.message}`)
		.join("\n");
}

function formatLocalSpeechAnchors(request: SmartDemoAIAnalysisRequest) {
	const anchors = request.localAnalysis.speechAnchors ?? [];
	if (anchors.length === 0) {
		return "No local speech anchors were inferred.";
	}

	return anchors
		.map(
			(anchor) =>
				`@${anchor.startMs}-${anchor.endMs}ms | target=${anchor.referencedTarget ?? "unknown"} | confidence=${anchor.confidence.toFixed(2)} | ${anchor.text}`,
		)
		.join("\n");
}

export function buildSmartDemoSystemPrompt() {
	return [
		"You are an expert product-demo editor.",
		"Given a screen recording summary, transcript, and sampled frames, produce editing suggestions for a concise software demo.",
		"Use transcript language as a first-class intent signal, not just cursor motion.",
		"When narration says things like click this button, look at this chart, notice this panel, or open this menu, resolve the likely target using nearby steps, cursor movement, and frames.",
		"Return strict JSON only, with no markdown fences and no prose outside the JSON object.",
		'Use this exact top-level shape: {"summary": string, "steps": Step[], "zooms": Zoom[], "trims": Trim[], "speechAnchors": SpeechAnchor[], "narrationLinkedZooms": NarrationZoom[], "focusMoments": FocusMoment[]}.',
		"Step must contain id, timestampMs, title, description, confidence.",
		"Zoom must contain id, startMs, endMs, focus:{cx,cy}, depth, reason.",
		"Trim must contain id, startMs, endMs, reason.",
		"SpeechAnchor must contain id, startMs, endMs, text, referencedTarget, confidence.",
		"NarrationZoom must contain id, startMs, endMs, focus:{cx,cy}, depth, reason, anchorId.",
		"FocusMoment must contain id, timestampMs, title, reason, anchorId, confidence.",
		"Use normalized focus coordinates in the inclusive range [0, 1].",
		"Use zoom depth integers from 1 to 6.",
		"Only suggest trims that remove low-value dead time and do not cut likely user intent.",
		"When transcript is present, prefer narration-linked zooms for moments where speech calls attention to a UI element even without a click.",
		"Prefer precise, user-facing action names over generic labels.",
	].join(" ");
}

export function buildSmartDemoUserPrompt(request: SmartDemoAIAnalysisRequest) {
	return [
		`User goal: ${request.userPrompt || "Create a concise, polished product demo."}`,
		`Video duration: ${request.durationMs}ms`,
		`Local analysis summary: clicks=${request.localAnalysis.clicks}, zooms=${request.localAnalysis.zooms}, silences=${request.localAnalysis.silences}`,
		"Local steps:",
		formatLocalSteps(request),
		"Local transcript warnings:",
		formatTranscriptWarnings(request),
		"Local speech anchors:",
		formatLocalSpeechAnchors(request),
		"Transcript segments:",
		formatTranscriptSegments(request),
		"Speech windows:",
		formatSpeechWindows(request),
		"Frame samples:",
		formatFrameHints(request),
	].join("\n\n");
}
