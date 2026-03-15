import {
	BufferTarget,
	EncodedAudioPacketSource,
	EncodedPacket,
	EncodedVideoPacketSource,
	Mp4OutputFormat,
	Output,
} from "mediabunny";
import type { ExportConfig } from "./types";

type MuxerCodec = "avc" | "hevc" | "vp9" | "vp8" | "av1";

/** Map a WebCodecs codec string (e.g. "avc1.640033") to a mediabunny codec family. */
function toMuxerCodec(codec: string | undefined): MuxerCodec {
	if (!codec) return "avc";
	if (codec.startsWith("avc1") || codec.startsWith("avc3")) return "avc";
	if (codec.startsWith("hvc1") || codec.startsWith("hev1")) return "hevc";
	if (codec.startsWith("vp09") || codec.startsWith("vp9")) return "vp9";
	if (codec.startsWith("vp8")) return "vp8";
	if (codec.startsWith("av01")) return "av1";
	return "avc"; // safe default
}

export class VideoMuxer {
	private output: Output | null = null;
	private videoSource: EncodedVideoPacketSource | null = null;
	private audioSource: EncodedAudioPacketSource | null = null;
	private hasAudio: boolean;
	private target: BufferTarget | null = null;
	private config: ExportConfig;

	constructor(config: ExportConfig, hasAudio = false) {
		this.config = config;
		this.hasAudio = hasAudio;
	}

	async initialize(): Promise<void> {
		// Create the buffer target
		this.target = new BufferTarget();

		this.output = new Output({
			format: new Mp4OutputFormat({
				fastStart: "in-memory",
			}),
			target: this.target,
		});

		// Create video source — codec family derived from config
		this.videoSource = new EncodedVideoPacketSource(toMuxerCodec(this.config.codec));
		this.output.addVideoTrack(this.videoSource, {
			frameRate: this.config.frameRate,
		});

		// Create audio source if needed
		if (this.hasAudio) {
			this.audioSource = new EncodedAudioPacketSource("opus");
			this.output.addAudioTrack(this.audioSource);
		}

		// Start the output to begin accepting media data
		await this.output.start();
	}

	async addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): Promise<void> {
		if (!this.videoSource) {
			throw new Error("Muxer not initialized");
		}

		// Convert WebCodecs chunk to Mediabunny packet
		const packet = EncodedPacket.fromEncodedChunk(chunk);

		// Add metadata with the first chunk
		await this.videoSource.add(packet, meta);
	}

	async addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): Promise<void> {
		if (!this.audioSource) {
			throw new Error("Audio not configured for this muxer");
		}

		// Convert WebCodecs chunk to Mediabunny packet
		const packet = EncodedPacket.fromEncodedChunk(chunk);

		// Add metadata with the first chunk
		await this.audioSource.add(packet, meta);
	}

	async finalize(): Promise<Blob> {
		if (!this.output || !this.target) {
			throw new Error("Muxer not initialized");
		}

		await this.output.finalize();
		const buffer = this.target.buffer;

		if (!buffer) {
			throw new Error("Failed to finalize output");
		}

		return new Blob([buffer], { type: "video/mp4" });
	}
}
