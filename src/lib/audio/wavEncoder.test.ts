import { encodeMonoWavFromChunkedChannels } from "./wavEncoder";

function readAscii(buffer: ArrayBuffer, start: number, length: number) {
	return String.fromCharCode(...new Uint8Array(buffer, start, length));
}

describe("encodeMonoWavFromChunkedChannels", () => {
	it("writes a valid mono PCM WAV header", () => {
		const buffer = encodeMonoWavFromChunkedChannels(
			[[new Float32Array([0, 0.5]), new Float32Array([-0.5, 1])]],
			16_000,
		);
		const view = new DataView(buffer);

		expect(readAscii(buffer, 0, 4)).toBe("RIFF");
		expect(readAscii(buffer, 8, 4)).toBe("WAVE");
		expect(readAscii(buffer, 12, 4)).toBe("fmt ");
		expect(readAscii(buffer, 36, 4)).toBe("data");
		expect(view.getUint16(20, true)).toBe(1);
		expect(view.getUint16(22, true)).toBe(1);
		expect(view.getUint32(24, true)).toBe(16_000);
		expect(view.getUint16(34, true)).toBe(16);
		expect(view.getUint32(40, true)).toBe(8);
	});

	it("downmixes multiple channels into mono samples", () => {
		const buffer = encodeMonoWavFromChunkedChannels(
			[[new Float32Array([1, 1])], [new Float32Array([-1, 1])]],
			8_000,
		);
		const view = new DataView(buffer);

		expect(view.getInt16(44, true)).toBe(0);
		expect(view.getInt16(46, true)).toBe(32_767);
	});

	it("returns an empty buffer when there is no captured audio", () => {
		expect(encodeMonoWavFromChunkedChannels([], 16_000).byteLength).toBe(0);
	});
});
