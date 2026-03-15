import { createTranscriptionConfigStore } from "./store";

describe("transcription config store", () => {
	function createMemoryFs() {
		const files = new Map<string, string>();
		return {
			files,
			fs: {
				async mkdir() {},
				async readFile(filePath: string) {
					if (!files.has(filePath)) {
						const error = new Error("ENOENT") as NodeJS.ErrnoException;
						error.code = "ENOENT";
						throw error;
					}
					return files.get(filePath) ?? "";
				},
				async writeFile(filePath: string, contents: string) {
					files.set(filePath, contents);
				},
				async rm(filePath: string) {
					files.delete(filePath);
				},
			},
		};
	}

	it("defaults to auto transcription when no config exists", async () => {
		const memory = createMemoryFs();
		const store = createTranscriptionConfigStore({
			fs: memory.fs,
			getUserDataPath: () => "/tmp/app",
		});

		await expect(store.getConfig()).resolves.toEqual({
			provider: "auto",
			enabled: true,
		});
	});

	it("saves and reloads a transcription provider preference", async () => {
		const memory = createMemoryFs();
		const store = createTranscriptionConfigStore({
			fs: memory.fs,
			getUserDataPath: () => "/tmp/app",
		});

		await expect(
			store.saveConfig({
				provider: "macos-native",
				enabled: true,
			}),
		).resolves.toEqual({
			provider: "macos-native",
			enabled: true,
		});

		await expect(store.getConfig()).resolves.toEqual({
			provider: "macos-native",
			enabled: true,
		});
	});
});
