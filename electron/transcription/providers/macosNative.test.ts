const { accessMock, appMock, readFileMock, rmMock } = vi.hoisted(() => ({
	accessMock: vi.fn(),
	appMock: {
		isPackaged: false,
		getAppPath: vi.fn(() => "/workspace"),
		getPath: vi.fn(() => "/tmp"),
	},
	readFileMock: vi.fn(),
	rmMock: vi.fn(),
}));

vi.mock("electron", () => ({
	app: appMock,
}));

vi.mock("node:fs/promises", () => ({
	default: {
		access: accessMock,
		readFile: readFileMock,
		rm: rmMock,
	},
	access: accessMock,
	readFile: readFileMock,
	rm: rmMock,
}));

import { MacOSNativeTranscriptionProvider } from "./macosNative";

describe("MacOSNativeTranscriptionProvider availability", () => {
	beforeEach(() => {
		accessMock.mockReset();
		appMock.isPackaged = false;
		appMock.getAppPath.mockReturnValue("/workspace");
	});

	it("is available in development when the helper app bundle exists", async () => {
		accessMock.mockResolvedValue(undefined);
		const provider = new MacOSNativeTranscriptionProvider();

		await expect(provider.isAvailable({ aiConfig: null })).resolves.toEqual({ available: true });
		expect(accessMock).toHaveBeenCalledWith("/workspace/build/native/MacOSTranscriber.app");
	});

	it("explains how to enable development availability when the helper is missing", async () => {
		accessMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
		const provider = new MacOSNativeTranscriptionProvider();

		await expect(provider.isAvailable({ aiConfig: null })).resolves.toEqual({
			available: false,
			reason:
				"macOS transcription helper app is unavailable. Run `npm run build:macos-transcriber` before using macOS Native transcription in development.",
		});
	});
});
