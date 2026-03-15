import fs from "node:fs/promises";
import path from "node:path";
import { app, safeStorage } from "electron";
import {
	type AIResult,
	err,
	normalizeResolvedAIConfig,
	normalizeSaveAIConfigInput,
	ok,
	type PublicAIConfig,
	providerRequiresApiKey,
	type ResolvedAIConfig,
	type SaveAIConfigInput,
	toPublicAIConfig,
} from "../../shared/ai";

interface StoredAIConfig {
	provider: ResolvedAIConfig["provider"];
	model: string;
	baseUrl?: string;
	enabled: boolean;
	useVision: boolean;
	encryptedApiKey?: string;
}

interface SafeStorageLike {
	isEncryptionAvailable(): boolean;
	encryptString(value: string): Buffer;
	decryptString(value: Buffer): string;
}

interface StoreDeps {
	fs: Pick<typeof fs, "mkdir" | "readFile" | "writeFile" | "rm">;
	safeStorage: SafeStorageLike;
	getUserDataPath: () => string;
}

const AI_CONFIG_FILE_NAME = "ai-config.json";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeStoredAIConfig(candidate: unknown): StoredAIConfig | null {
	if (!isRecord(candidate)) {
		return null;
	}

	const provider = candidate.provider;
	const model = typeof candidate.model === "string" ? candidate.model.trim() : "";
	const encryptedApiKey =
		typeof candidate.encryptedApiKey === "string" && candidate.encryptedApiKey.trim().length > 0
			? candidate.encryptedApiKey.trim()
			: undefined;

	if (
		(provider !== "openai" && provider !== "ollama") ||
		!model ||
		typeof candidate.enabled !== "boolean"
	) {
		return null;
	}

	if (providerRequiresApiKey(provider) && !encryptedApiKey) {
		return null;
	}

	return {
		provider,
		model,
		baseUrl:
			typeof candidate.baseUrl === "string" && candidate.baseUrl.trim().length > 0
				? candidate.baseUrl.trim()
				: undefined,
		enabled: candidate.enabled,
		useVision: typeof candidate.useVision === "boolean" ? candidate.useVision : false,
		encryptedApiKey,
	};
}

export function createAIConfigStore(deps: StoreDeps) {
	const getConfigPath = () => path.join(deps.getUserDataPath(), AI_CONFIG_FILE_NAME);

	async function readStoredConfig(): Promise<StoredAIConfig | null> {
		try {
			const raw = await deps.fs.readFile(getConfigPath(), "utf-8");
			const parsed = JSON.parse(raw);
			return normalizeStoredAIConfig(parsed);
		} catch (error) {
			const nodeError = error as NodeJS.ErrnoException;
			if (nodeError.code === "ENOENT") {
				return null;
			}
			throw error;
		}
	}

	async function writeStoredConfig(config: StoredAIConfig) {
		await deps.fs.mkdir(deps.getUserDataPath(), { recursive: true });
		await deps.fs.writeFile(getConfigPath(), JSON.stringify(config, null, 2), "utf-8");
	}

	function encryptApiKey(apiKey: string): string {
		if (!deps.safeStorage.isEncryptionAvailable()) {
			throw new Error("Secure credential storage is not available on this system.");
		}

		return deps.safeStorage.encryptString(apiKey).toString("base64");
	}

	function decryptApiKey(encryptedApiKey: string): string {
		if (!deps.safeStorage.isEncryptionAvailable()) {
			throw new Error("Secure credential storage is not available on this system.");
		}

		return deps.safeStorage.decryptString(Buffer.from(encryptedApiKey, "base64"));
	}

	return {
		async getPublicConfig(): Promise<PublicAIConfig | null> {
			const storedConfig = await readStoredConfig();
			if (!storedConfig) {
				return null;
			}

			const resolvedConfig = normalizeResolvedAIConfig({
				provider: storedConfig.provider,
				model: storedConfig.model,
				apiKey: storedConfig.encryptedApiKey
					? decryptApiKey(storedConfig.encryptedApiKey)
					: undefined,
				baseUrl: storedConfig.baseUrl,
				enabled: storedConfig.enabled,
				useVision: storedConfig.useVision,
			});

			return resolvedConfig ? toPublicAIConfig(resolvedConfig) : null;
		},

		async getResolvedConfig(): Promise<ResolvedAIConfig | null> {
			const storedConfig = await readStoredConfig();
			if (!storedConfig) {
				return null;
			}

			return normalizeResolvedAIConfig({
				provider: storedConfig.provider,
				model: storedConfig.model,
				apiKey: storedConfig.encryptedApiKey
					? decryptApiKey(storedConfig.encryptedApiKey)
					: undefined,
				baseUrl: storedConfig.baseUrl,
				enabled: storedConfig.enabled,
				useVision: storedConfig.useVision,
			});
		},

		async saveConfig(input: SaveAIConfigInput): Promise<PublicAIConfig> {
			const normalized = normalizeSaveAIConfigInput(input);
			if (!normalized) {
				throw new Error("Invalid AI configuration.");
			}

			const existingConfig = await readStoredConfig();
			const existingApiKey = existingConfig?.encryptedApiKey
				? decryptApiKey(existingConfig.encryptedApiKey)
				: undefined;
			const apiKey = normalized.apiKey || existingApiKey;
			if (providerRequiresApiKey(normalized.provider) && !apiKey) {
				throw new Error("An API key is required to save AI configuration.");
			}

			await writeStoredConfig({
				provider: normalized.provider,
				model: normalized.model,
				baseUrl: normalized.baseUrl,
				enabled: normalized.enabled,
				useVision: normalized.useVision,
				encryptedApiKey: apiKey ? encryptApiKey(apiKey) : undefined,
			});

			return toPublicAIConfig({
				provider: normalized.provider,
				model: normalized.model,
				baseUrl: normalized.baseUrl,
				enabled: normalized.enabled,
				useVision: normalized.useVision,
				apiKey,
			});
		},

		async clearConfig(): Promise<void> {
			await deps.fs.rm(getConfigPath(), { force: true });
		},

		getConfigPath,
	};
}

const store = createAIConfigStore({
	fs,
	safeStorage,
	getUserDataPath: () => app.getPath("userData"),
});

export async function getPublicAIConfigResult(): Promise<AIResult<PublicAIConfig | null>> {
	try {
		return ok(await store.getPublicConfig());
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}

export async function saveAIConfigResult(input: unknown): Promise<AIResult<PublicAIConfig>> {
	const normalized = normalizeSaveAIConfigInput(input);
	if (!normalized) {
		return err("Invalid AI configuration.");
	}

	try {
		return ok(await store.saveConfig(normalized));
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}

export async function clearAIConfigResult(): Promise<AIResult<true>> {
	try {
		await store.clearConfig();
		return ok(true);
	} catch (error) {
		return err(error instanceof Error ? error.message : String(error));
	}
}

export { store as aiConfigStore };
