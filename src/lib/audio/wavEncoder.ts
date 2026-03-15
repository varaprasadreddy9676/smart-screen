const BITS_PER_SAMPLE = 16;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const PCM_FORMAT = 1;

function clampSample(value: number) {
	return Math.max(-1, Math.min(1, value));
}

function mergeChunks(chunks: Float32Array[]) {
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const merged = new Float32Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		merged.set(chunk, offset);
		offset += chunk.length;
	}
	return merged;
}

export function encodeMonoWavFromChunkedChannels(
	channelChunks: Float32Array[][],
	sampleRate: number,
) {
	if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
		throw new Error("A positive sample rate is required to encode WAV audio.");
	}

	const mergedChannels = channelChunks
		.map((chunks) => mergeChunks(chunks))
		.filter((channel) => channel.length > 0);

	if (mergedChannels.length === 0) {
		return new ArrayBuffer(0);
	}

	const frameCount = Math.max(...mergedChannels.map((channel) => channel.length));
	const dataSize = frameCount * BYTES_PER_SAMPLE;
	const buffer = new ArrayBuffer(44 + dataSize);
	const view = new DataView(buffer);

	let offset = 0;
	const writeString = (value: string) => {
		for (let index = 0; index < value.length; index += 1) {
			view.setUint8(offset + index, value.charCodeAt(index));
		}
		offset += value.length;
	};
	const writeUint16 = (value: number) => {
		view.setUint16(offset, value, true);
		offset += 2;
	};
	const writeUint32 = (value: number) => {
		view.setUint32(offset, value, true);
		offset += 4;
	};

	writeString("RIFF");
	writeUint32(36 + dataSize);
	writeString("WAVE");
	writeString("fmt ");
	writeUint32(16);
	writeUint16(PCM_FORMAT);
	writeUint16(1);
	writeUint32(Math.round(sampleRate));
	writeUint32(Math.round(sampleRate) * BYTES_PER_SAMPLE);
	writeUint16(BYTES_PER_SAMPLE);
	writeUint16(BITS_PER_SAMPLE);
	writeString("data");
	writeUint32(dataSize);

	for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
		let sample = 0;
		for (const channel of mergedChannels) {
			sample += channel[frameIndex] ?? 0;
		}
		const monoSample = clampSample(sample / mergedChannels.length);
		const int16Sample = monoSample < 0 ? monoSample * 0x8000 : monoSample * 0x7fff;
		view.setInt16(offset, Math.round(int16Sample), true);
		offset += BYTES_PER_SAMPLE;
	}

	return buffer;
}
