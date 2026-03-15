import fs from "node:fs/promises";
import path from "node:path";
import { app } from "electron";
import {
	type AIResult,
	err,
	normalizePublicTranscriptionConfig,
	normalizeSaveTranscriptionConfigInput,
	ok,
	type PublicTranscriptionConfig,
	type SaveTranscriptionConfigInput,
} from "../../shared/ai";

interface StoreDeps {
	fs: Pick<typeof fs, "mkdir" | "readFile" | "writeFile" | "rm">;
	getUserDataPath: () => string;
}

const TRANSCRIPTION_CONFIG_FILE_NAME = "transcription-config.json";

export function createTranscriptionConfigStore(deps: StoreDeps) {
	const getConfigPath = () => path.join(deps.getUserDataPath(), TRANSCRIPTION_CONFIG_FILE_NAME);

	async function readStoredConfig(): Promise<PublicTranscriptionConfig | null> {
		try {
			const raw = await deps.fs.readFile(getConfigPath(), "utf-8");
			return normalizePublicTranscriptionConfig(JSON.parse(raw));
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") {
				return null;
			}
			throw error;
		}
	}

	return {
		async getConfig(): Promise<PublicTranscriptionConfig> {
			return (await readStoredConfig()) ?? { provider: "auto", enabled: true };
		},

		async saveConfig(input: SaveTranscriptionConfigInput): Promise<PublicTranscriptionConfig> {
			const normalized = normalizeSaveTranscriptionConfigInput(input);
			if (!normalized) {
				throw new Error("Invalid transcription configuration.");
			}

			await deps.fs.mkdir(deps.getUserDataPath(), { recursive: true });
			await deps.fs.writeFile(getConfigPath(), JSON.stringify(normalized, null, 2), "utf-8");
			return normalized;
		},

		async clearConfig(): Promise<void> {
			await deps.fs.rm(getConfigPath(), { force: true });
		},

		getConfigPath,
	};
}

const store = createTranscriptionConfigStore({
	fs,
	getUserDataPath: () => app.getPath("userData"),
});

export async function getPublicTranscriptionConfigResult(): Promise<
	AIResult<PublicTranscriptionConfig>
> {
	try {
		return ok(await store.getConfig());
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}

export async function saveTranscriptionConfigResult(
	input: unknown,
): Promise<AIResult<PublicTranscriptionConfig>> {
	const normalized = normalizeSaveTranscriptionConfigInput(input);
	if (!normalized) {
		return err("Invalid transcription configuration.");
	}

	try {
		return ok(await store.saveConfig(normalized));
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}

export { store as transcriptionConfigStore };
