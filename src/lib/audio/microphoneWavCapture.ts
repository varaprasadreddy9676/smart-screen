import { encodeMonoWavFromChunkedChannels } from "./wavEncoder";

type BrowserAudioContext = AudioContext;

function getAudioContextConstructor(): typeof AudioContext | null {
	const scope = globalThis as typeof globalThis & {
		webkitAudioContext?: typeof AudioContext;
	};
	return scope.AudioContext ?? scope.webkitAudioContext ?? null;
}

export class MicrophoneWavCapture {
	private audioContext: BrowserAudioContext | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;
	private processorNode: ScriptProcessorNode | null = null;
	private sinkNode: GainNode | null = null;
	private channelChunks: Float32Array[][] = [];
	private paused = false;

	async start(stream: MediaStream) {
		const AudioContextCtor = getAudioContextConstructor();
		if (!AudioContextCtor) {
			throw new Error("This build does not support browser audio processing for WAV capture.");
		}

		this.channelChunks = [];
		this.paused = false;
		this.audioContext = new AudioContextCtor();
		await this.audioContext.resume();

		this.sourceNode = this.audioContext.createMediaStreamSource(stream);
		this.processorNode = this.audioContext.createScriptProcessor(4096, 2, 2);
		this.sinkNode = this.audioContext.createGain();
		this.sinkNode.gain.value = 0;

		this.processorNode.onaudioprocess = (event) => {
			if (this.paused) {
				return;
			}

			const channelCount = event.inputBuffer.numberOfChannels;
			while (this.channelChunks.length < channelCount) {
				this.channelChunks.push([]);
			}

			for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
				this.channelChunks[channelIndex]?.push(
					new Float32Array(event.inputBuffer.getChannelData(channelIndex)),
				);
			}
		};

		this.sourceNode.connect(this.processorNode);
		this.processorNode.connect(this.sinkNode);
		this.sinkNode.connect(this.audioContext.destination);
	}

	async stop() {
		const sampleRate = this.audioContext?.sampleRate ?? 0;
		const bufferedChunks = this.channelChunks.map((chunks) => [...chunks]);
		await this.cleanup();

		const wavBuffer = encodeMonoWavFromChunkedChannels(bufferedChunks, sampleRate);
		return wavBuffer.byteLength > 0 ? wavBuffer : null;
	}

	pause() {
		this.paused = true;
	}

	resume() {
		this.paused = false;
	}

	async cleanup() {
		this.processorNode?.disconnect();
		this.sourceNode?.disconnect();
		this.sinkNode?.disconnect();
		this.processorNode = null;
		this.sourceNode = null;
		this.sinkNode = null;

		if (this.audioContext) {
			await this.audioContext.close().catch(() => {});
			this.audioContext = null;
		}

		this.channelChunks = [];
		this.paused = false;
	}
}
