import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import type { TranscriptSegment } from "../../../shared/ai";
import { resolvePreparedTranscriptionInput } from "../preparedInput";
import type { TranscriptionContext, TranscriptionProvider } from "./base";

const execFile = promisify(execFileCallback);
const HELPER_APP_NAME = "MacOSTranscriber.app";

interface MacOSNativeTranscriptionResponse {
	segments?: TranscriptSegment[];
	error?: string;
}

async function fileExists(filePath: string) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function resolveHelperAppPath() {
	const helperAppPath = app.isPackaged
		? path.join(process.resourcesPath, "native-tools", HELPER_APP_NAME)
		: path.join(app.getAppPath(), "build", "native", HELPER_APP_NAME);
	if (await fileExists(helperAppPath)) {
		return helperAppPath;
	}

	throw new Error(
		app.isPackaged
			? "macOS transcription helper app is unavailable in this packaged build."
			: "macOS transcription helper app is unavailable. Run `npm run build:macos-transcriber` before using macOS Native transcription in development.",
	);
}

export class MacOSNativeTranscriptionProvider implements TranscriptionProvider {
	readonly id = "macos-native" as const;
	readonly label = "macOS Native";

	async isAvailable(_context: TranscriptionContext) {
		if (process.platform !== "darwin") {
			return { available: false, reason: "macOS native transcription is only available on macOS." };
		}

		try {
			await resolveHelperAppPath();
		} catch (error) {
			return {
				available: false,
				reason: error instanceof Error ? error.message : String(error),
			};
		}

		return { available: true };
	}

	async transcribe(
		videoPath: string,
		_context: TranscriptionContext,
	): Promise<TranscriptSegment[]> {
		if (process.platform !== "darwin") {
			throw new Error("macOS native transcription is only available on macOS.");
		}

		const helperPath = await resolveHelperAppPath();
		const preparedInput = await resolvePreparedTranscriptionInput(videoPath);
		const outputPath = path.join(app.getPath("temp"), `macos-transcription-${Date.now()}.json`);
		try {
			await execFile(
				"open",
				[
					"-W",
					"-a",
					helperPath,
					"--args",
					"--input",
					preparedInput.inputPath,
					"--output",
					outputPath,
				],
				{
					maxBuffer: 10 * 1024 * 1024,
				},
			);
		} catch (error) {
			const outputExists = await fileExists(outputPath);
			if (!outputExists) {
				throw error;
			}
		}

		const rawOutput = await fs.readFile(outputPath, "utf-8").catch(() => "");
		if (!rawOutput.trim()) {
			throw new Error("macOS transcription helper returned no output.");
		}

		let payload: MacOSNativeTranscriptionResponse;
		try {
			payload = JSON.parse(rawOutput) as MacOSNativeTranscriptionResponse;
		} catch (error) {
			throw new Error(`macOS transcription helper returned invalid JSON: ${String(error)}`);
		} finally {
			await preparedInput.cleanup().catch(() => {});
			await fs.rm(outputPath, { force: true }).catch(() => {});
		}

		if (!Array.isArray(payload.segments) || payload.segments.length === 0) {
			throw new Error(payload.error ?? "macOS transcription returned no transcript segments.");
		}

		return payload.segments;
	}
}
