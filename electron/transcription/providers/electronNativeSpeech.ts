import { createRequire } from "module";
import type { TranscriptSegment } from "../../../shared/ai";
import { resolvePreparedTranscriptionInput } from "../preparedInput";
import type { TranscriptionContext, TranscriptionProvider } from "./base";

const _require = createRequire(import.meta.url);

interface SpeechBackend {
	checkAvailability: () => Promise<{ available: boolean; reason?: string }>;
	transcribeFile: (options: { filePath: string }) => Promise<{ segments?: TranscriptSegment[] }>;
}

let cachedBackend: SpeechBackend | null = null;

function loadSpeechBackend(): SpeechBackend {
	if (cachedBackend) return cachedBackend;

	// Prefer the unscoped backend that this project ships.
	// electron-native-speech's auto-discovery looks for the scoped package
	// (@electron-native-speech/backend-macos) which is NOT installed here.
	try {
		const mod = _require("electron-native-speech-backend-macos") as {
			MacOSSpeechBackend: new () => SpeechBackend;
		};
		cachedBackend = new mod.MacOSSpeechBackend();
		return cachedBackend;
	} catch (error) {
		throw new Error(
			`electron-native-speech-backend-macos is not available: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

/**
 * macOS transcription provider backed by electron-native-speech-backend-macos.
 *
 * Uses Apple's SFSpeechRecognizer via a persistent SpeechHelper process.
 * Bypasses the electron-native-speech wrapper to avoid the scoped-package
 * auto-discovery that fails in this project (we ship the unscoped variant).
 *
 * Audio source priority:
 *   1. .transcription.wav sidecar (microphone audio captured during recording)
 *   2. The recording file directly (WAV, M4A, MP3, MP4, MOV natively; WebM via ffmpeg)
 */
export class ElectronNativeSpeechProvider implements TranscriptionProvider {
	readonly id = "macos-native" as const;
	readonly label = "macOS Native";

	async isAvailable(_context: TranscriptionContext) {
		if (process.platform !== "darwin") {
			return {
				available: false,
				reason: "macOS native transcription is only available on macOS.",
			};
		}

		try {
			const backend = loadSpeechBackend();
			console.log("[transcription] MacOSSpeechBackend loaded, checking availability…");
			const av = await backend.checkAvailability();
			console.log("[transcription] checkAvailability result:", JSON.stringify(av));
			if (!av.available) {
				return { available: false, reason: av.reason ?? "Speech recognition is unavailable." };
			}
			return { available: true };
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			console.error("[transcription] isAvailable error:", reason);
			return { available: false, reason };
		}
	}

	async transcribe(
		videoPath: string,
		_context: TranscriptionContext,
	): Promise<TranscriptSegment[]> {
		if (process.platform !== "darwin") {
			throw new Error("macOS native transcription is only available on macOS.");
		}

		// Resolve the best audio source: sidecar WAV → direct media → ffmpeg-extracted WAV
		const preparedInput = await resolvePreparedTranscriptionInput(videoPath);

		try {
			const backend = loadSpeechBackend();
			const result = await backend.transcribeFile({ filePath: preparedInput.inputPath });

			if (!result.segments || result.segments.length === 0) {
				throw new Error("No speech detected in the recording.");
			}

			return result.segments.map((seg) => ({
				id: seg.id,
				startMs: seg.startMs,
				endMs: seg.endMs,
				text: seg.text,
				confidence: seg.confidence,
			}));
		} finally {
			await preparedInput.cleanup().catch(() => {});
		}
	}
}
