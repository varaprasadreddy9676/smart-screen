import type { PublicAIConfig } from "@shared/ai";

vi.mock("electron", () => ({
	app: {
		getPath: () => "/tmp/codex-tests",
	},
	safeStorage: {
		isEncryptionAvailable: () => true,
		encryptString: (value: string) => Buffer.from(`enc:${value}`),
		decryptString: (value: Buffer) => value.toString().replace(/^enc:/, ""),
	},
}));

async function loadStoreModule() {
	return await import("./store");
}

describe("electron/ai/store", () => {
	it("saves config with encrypted credentials and returns a public config", async () => {
		const files = new Map<string, string>();
		const { createAIConfigStore } = await loadStoreModule();
		const store = createAIConfigStore({
			fs: {
				mkdir: vi.fn(async () => undefined),
				readFile: vi.fn(async (filePath: string) => {
					const value = files.get(filePath);
					if (!value) {
						const error = new Error("missing") as NodeJS.ErrnoException;
						error.code = "ENOENT";
						throw error;
					}
					return value;
				}),
				writeFile: vi.fn(async (filePath: string, content: string) => {
					files.set(filePath, content);
				}),
				rm: vi.fn(async (filePath: string) => {
					files.delete(filePath);
				}),
			},
			safeStorage: {
				isEncryptionAvailable: () => true,
				encryptString: (value: string) => Buffer.from(`enc:${value}`),
				decryptString: (value: Buffer) => value.toString().replace(/^enc:/, ""),
			},
			getUserDataPath: () => "/tmp/codex-tests",
		});

		const publicConfig = await store.saveConfig({
			provider: "openai",
			model: "gpt-5-mini",
			apiKey: "secret-key",
			enabled: true,
			useVision: true,
		});

		expect(publicConfig).toEqual<PublicAIConfig>({
			provider: "openai",
			model: "gpt-5-mini",
			enabled: true,
			hasKey: true,
			useVision: true,
		});

		const persisted = files.get("/tmp/codex-tests/ai-config.json");
		expect(persisted).toContain("ZW5jOnNlY3JldC1rZXk=");

		expect(await store.getResolvedConfig()).toEqual({
			provider: "openai",
			model: "gpt-5-mini",
			apiKey: "secret-key",
			enabled: true,
			useVision: true,
			baseUrl: undefined,
		});
	});

	it("preserves the existing key when saving a config update without a new key", async () => {
		const files = new Map<string, string>([
			[
				"/tmp/codex-tests/ai-config.json",
				JSON.stringify({
					provider: "openai",
					model: "gpt-5-mini",
					enabled: true,
					useVision: false,
					encryptedApiKey: Buffer.from("enc:secret-key").toString("base64"),
				}),
			],
		]);
		const { createAIConfigStore } = await loadStoreModule();
		const store = createAIConfigStore({
			fs: {
				mkdir: vi.fn(async () => undefined),
				readFile: vi.fn(async (filePath: string) => {
					const value = files.get(filePath);
					if (!value) {
						const error = new Error("missing") as NodeJS.ErrnoException;
						error.code = "ENOENT";
						throw error;
					}
					return value;
				}),
				writeFile: vi.fn(async (filePath: string, content: string) => {
					files.set(filePath, content);
				}),
				rm: vi.fn(async (filePath: string) => {
					files.delete(filePath);
				}),
			},
			safeStorage: {
				isEncryptionAvailable: () => true,
				encryptString: (value: string) => Buffer.from(`enc:${value}`),
				decryptString: (value: Buffer) => value.toString().replace(/^enc:/, ""),
			},
			getUserDataPath: () => "/tmp/codex-tests",
		});

		await store.saveConfig({
			provider: "openai",
			model: "gpt-5",
			apiKey: "",
			baseUrl: "https://api.openai.com/v1",
			enabled: false,
			useVision: true,
		});

		expect(await store.getResolvedConfig()).toEqual({
			provider: "openai",
			model: "gpt-5",
			apiKey: "secret-key",
			baseUrl: "https://api.openai.com/v1",
			enabled: false,
			useVision: true,
		});
	});

	it("allows ollama configs without a key", async () => {
		const files = new Map<string, string>();
		const { createAIConfigStore } = await loadStoreModule();
		const store = createAIConfigStore({
			fs: {
				mkdir: vi.fn(async () => undefined),
				readFile: vi.fn(async (filePath: string) => {
					const value = files.get(filePath);
					if (!value) {
						const error = new Error("missing") as NodeJS.ErrnoException;
						error.code = "ENOENT";
						throw error;
					}
					return value;
				}),
				writeFile: vi.fn(async (filePath: string, content: string) => {
					files.set(filePath, content);
				}),
				rm: vi.fn(async (filePath: string) => {
					files.delete(filePath);
				}),
			},
			safeStorage: {
				isEncryptionAvailable: () => true,
				encryptString: (value: string) => Buffer.from(`enc:${value}`),
				decryptString: (value: Buffer) => value.toString().replace(/^enc:/, ""),
			},
			getUserDataPath: () => "/tmp/codex-tests",
		});

		expect(
			await store.saveConfig({
				provider: "ollama",
				model: "llama3.2",
				apiKey: "",
				enabled: true,
				useVision: false,
			}),
		).toEqual<PublicAIConfig>({
			provider: "ollama",
			model: "llama3.2",
			enabled: true,
			hasKey: false,
			useVision: false,
		});

		expect(await store.getResolvedConfig()).toEqual({
			provider: "ollama",
			model: "llama3.2",
			enabled: true,
			useVision: false,
			apiKey: undefined,
			baseUrl: undefined,
		});
	});
});
