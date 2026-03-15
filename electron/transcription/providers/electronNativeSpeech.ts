import type { TranscriptSegment } from "../../../shared/ai";
import { resolvePreparedTranscriptionInput } from "../preparedInput";
import type { TranscriptionContext, TranscriptionProvider } from "./base";

interface NativeSpeechModule {
	getSpeechAvailability: () => Promise<{ available: boolean; reason?: string }>;
	transcribeFile: (input: { filePath: string }) => Promise<{ segments?: TranscriptSegment[] }>;
}

async function loadNativeSpeechModule(): Promise<NativeSpeechModule> {
	try {
		const dynamicImport = new Function("specifier", "return import(specifier)") as (
			specifier: string,
		) => Promise<unknown>;
		return (await dynamicImport("electron-native-speech")) as NativeSpeechModule;
	} catch (error) {
		throw new Error(
			`electron-native-speech is not available in this build: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}
}

/**
 * macOS transcription provider backed by electron-native-speech.
 *
 * Uses Apple's SFSpeechRecognizer via a persistent helper process —
 * no separate app bundle needed, no per-call spawn overhead, no temp JSON files.
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
			const { getSpeechAvailability } = await loadNativeSpeechModule();
			const av = await getSpeechAvailability();
			if (!av.available) {
				return { available: false, reason: av.reason ?? "Speech recognition is unavailable." };
			}
			return { available: true };
		} catch (error) {
			return {
				available: false,
				reason: error instanceof Error ? error.message : String(error),
			};
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
			const { transcribeFile } = await loadNativeSpeechModule();
			const result = await transcribeFile({ filePath: preparedInput.inputPath });

			if (!result.segments || result.segments.length === 0) {
				throw new Error("No speech detected in the recording.");
			}

			// Our TranscriptSegment shape matches theirs exactly
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
