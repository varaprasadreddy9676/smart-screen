import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { getTranscriptionAudioSidecarPath } from "../../shared/transcription";

const execFile = promisify(execFileCallback);

const DIRECT_MEDIA_EXTENSIONS = new Set([
	".wav",
	".m4a",
	".mp3",
	".aac",
	".aif",
	".aiff",
	".caf",
	".mp4",
	".mov",
]);

export interface PreparedTranscriptionInput {
	inputPath: string;
	source: "direct" | "sidecar" | "ffmpeg";
	cleanup: () => Promise<void>;
}

interface PreparedInputDeps {
	fs?: Pick<typeof fs, "access" | "mkdir" | "rm">;
	execFile?: typeof execFile;
	getTempDir?: () => string;
}

async function fileExists(filePath: string, fileSystem: Pick<typeof fs, "access">) {
	try {
		await fileSystem.access(filePath);
		return true;
	} catch {
		return false;
	}
}

function supportsDirectMediaInput(mediaPath: string) {
	return DIRECT_MEDIA_EXTENSIONS.has(path.extname(mediaPath).toLowerCase());
}

function getTempDir() {
	try {
		return app.getPath("temp");
	} catch {
		return os.tmpdir();
	}
}

export async function resolvePreparedTranscriptionInput(
	mediaPath: string,
	{
		fs: fileSystem = fs,
		execFile: exec = execFile,
		getTempDir: getTempDirOverride = getTempDir,
	}: PreparedInputDeps = {},
): Promise<PreparedTranscriptionInput> {
	const sidecarPath = getTranscriptionAudioSidecarPath(mediaPath);
	if (await fileExists(sidecarPath, fileSystem)) {
		return {
			inputPath: sidecarPath,
			source: "sidecar",
			cleanup: async () => {},
		};
	}

	if (supportsDirectMediaInput(mediaPath)) {
		return {
			inputPath: mediaPath,
			source: "direct",
			cleanup: async () => {},
		};
	}

	const tempDir = path.join(getTempDirOverride(), "openscreen-transcription");
	await fileSystem.mkdir(tempDir, { recursive: true });

	const preparedAudioPath = path.join(
		tempDir,
		`${path.basename(mediaPath, path.extname(mediaPath))}-${Date.now()}.wav`,
	);

	try {
		await exec(
			process.env["FFMPEG_PATH"] || "ffmpeg",
			[
				"-y",
				"-i",
				mediaPath,
				"-vn",
				"-ac",
				"1",
				"-ar",
				"16000",
				"-c:a",
				"pcm_s16le",
				preparedAudioPath,
			],
			{
				maxBuffer: 20 * 1024 * 1024,
			},
		);
	} catch (error) {
		const nodeError = error as NodeJS.ErrnoException;
		if (nodeError.code === "ENOENT") {
			throw new Error(
				"macOS native transcription needs a readable audio source. New recordings provide a .transcription.wav sidecar automatically; older WebM files require ffmpeg to prepare temporary audio.",
			);
		}
		throw new Error(
			`Failed to prepare audio for macOS native transcription: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
	}

	return {
		inputPath: preparedAudioPath,
		source: "ffmpeg",
		cleanup: async () => {
			await fileSystem.rm(preparedAudioPath, { force: true }).catch(() => {});
		},
	};
}
