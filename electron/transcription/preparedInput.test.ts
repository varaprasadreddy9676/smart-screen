import { getTranscriptionAudioSidecarPath } from "../../shared/transcription";
import { resolvePreparedTranscriptionInput } from "./preparedInput";

describe("resolvePreparedTranscriptionInput", () => {
	function createMemoryFs(existingPaths: string[] = []) {
		const files = new Set(existingPaths);
		return {
			fs: {
				async access(filePath: string) {
					if (!files.has(filePath)) {
						const error = new Error("ENOENT") as NodeJS.ErrnoException;
						error.code = "ENOENT";
						throw error;
					}
				},
				async mkdir(filePath: string) {
					files.add(filePath);
				},
				async rm(filePath: string) {
					files.delete(filePath);
				},
			},
			files,
		};
	}

	it("prefers a stored transcription audio sidecar when present", async () => {
		const videoPath = "/tmp/demo.webm";
		const memory = createMemoryFs([getTranscriptionAudioSidecarPath(videoPath)]);
		const execFile = vi.fn();

		await expect(
			resolvePreparedTranscriptionInput(videoPath, {
				fs: memory.fs,
				execFile,
				getTempDir: () => "/tmp",
			}),
		).resolves.toMatchObject({
			inputPath: "/tmp/demo.webm.transcription.wav",
			source: "sidecar",
		});
		expect(execFile).not.toHaveBeenCalled();
	});

	it("passes supported audio files through directly", async () => {
		const execFile = vi.fn();

		await expect(
			resolvePreparedTranscriptionInput("/tmp/demo.wav", {
				fs: createMemoryFs().fs,
				execFile,
				getTempDir: () => "/tmp",
			}),
		).resolves.toMatchObject({
			inputPath: "/tmp/demo.wav",
			source: "direct",
		});
		expect(execFile).not.toHaveBeenCalled();
	});

	it("uses ffmpeg to prepare legacy webm recordings when needed", async () => {
		const nowSpy = vi.spyOn(Date, "now").mockReturnValue(123456789);
		const memory = createMemoryFs();
		const execFile = vi.fn(async () => ({ stdout: "", stderr: "" }));

		const prepared = await resolvePreparedTranscriptionInput("/tmp/demo.webm", {
			fs: memory.fs,
			execFile,
			getTempDir: () => "/tmp",
		});

		expect(prepared.source).toBe("ffmpeg");
		expect(prepared.inputPath).toBe("/tmp/openscreen-transcription/demo-123456789.wav");
		expect(execFile).toHaveBeenCalledWith(
			"ffmpeg",
			expect.arrayContaining([
				"-i",
				"/tmp/demo.webm",
				"/tmp/openscreen-transcription/demo-123456789.wav",
			]),
			expect.objectContaining({ maxBuffer: 20 * 1024 * 1024 }),
		);

		await prepared.cleanup();
		nowSpy.mockRestore();
	});

	it("reports a helpful error when ffmpeg is unavailable for legacy webm files", async () => {
		const execFile = vi.fn(async () => {
			const error = new Error("spawn ffmpeg ENOENT") as NodeJS.ErrnoException;
			error.code = "ENOENT";
			throw error;
		});

		await expect(
			resolvePreparedTranscriptionInput("/tmp/demo.webm", {
				fs: createMemoryFs().fs,
				execFile,
				getTempDir: () => "/tmp",
			}),
		).rejects.toThrow(/older WebM files require ffmpeg/i);
	});
});
