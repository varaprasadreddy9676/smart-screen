import type { TranscriptSegment } from "@shared/ai";
import type {
	AnnotationRegion,
	CaptionSettings,
	CropRegion,
	CursorClickPulseSettings,
	CursorTelemetryPoint,
	KeystrokeOverlaySettings,
	KeystrokeTelemetryEvent,
	SpeedRegion,
	TrimRegion,
	ZoomRegion,
} from "@/components/video-editor/types";
import { FrameRenderer } from "./frameRenderer";
import { VideoMuxer } from "./muxer";
import { StreamingVideoDecoder } from "./streamingDecoder";
import type { ExportConfig, ExportProgress, ExportResult } from "./types";

interface VideoExporterConfig extends ExportConfig {
	videoUrl: string;
	wallpaper: string;
	zoomRegions: ZoomRegion[];
	trimRegions?: TrimRegion[];
	speedRegions?: SpeedRegion[];
	showShadow: boolean;
	shadowIntensity: number;
	showBlur: boolean;
	motionBlurEnabled?: boolean;
	zoomMotionBlur?: number;
	connectZooms?: boolean;
	borderRadius?: number;
	padding?: number;
	videoPadding?: number;
	cropRegion: CropRegion;
	annotationRegions?: AnnotationRegion[];
	transcriptSegments?: TranscriptSegment[];
	captionSettings?: CaptionSettings;
	cursorTelemetry?: CursorTelemetryPoint[];
	cursorClickPulseSettings?: CursorClickPulseSettings;
	keystrokeTelemetry?: KeystrokeTelemetryEvent[];
	keystrokeOverlaySettings?: KeystrokeOverlaySettings;
	previewWidth?: number;
	previewHeight?: number;
	onProgress?: (progress: ExportProgress) => void;
}

/**
 * Select the H.264 level codec string based on resolution and frame rate.
 * avc1.64XXYY where XX = constraint flags (00), YY = level_idc in hex.
 * Level 5.1 (0x33=51) supports up to ~4K@30fps.
 * Level 5.2 (0x34=52) supports up to ~4K@60fps.
 * Level 6.0 (0x3C=60) supports up to ~8K@30fps.
 */
function selectH264Codec(width: number, height: number, fps: number): string {
	const macroblocks = Math.ceil(width / 16) * Math.ceil(height / 16);
	const mbps = macroblocks * fps;
	if (mbps > 2_073_600) return "avc1.64003C"; // Level 6.0
	if (mbps > 983_040) return "avc1.640034"; // Level 5.2
	return "avc1.640033"; // Level 5.1 — handles 1080p@60fps and 4K@30fps
}

export class VideoExporter {
	private config: VideoExporterConfig;
	private streamingDecoder: StreamingVideoDecoder | null = null;
	private renderer: FrameRenderer | null = null;
	private encoder: VideoEncoder | null = null;
	private muxer: VideoMuxer | null = null;
	private cancelled = false;
	private encoderError: Error | null = null;
	private muxingError: Error | null = null;
	private encodeQueue = 0;
	// Increased queue size for better throughput with hardware encoding
	private readonly MAX_ENCODE_QUEUE = 120;
	private videoDescription: Uint8Array | undefined;
	private videoColorSpace: VideoColorSpaceInit | undefined;
	// Track muxing promises for parallel processing
	private muxingPromises: Promise<void>[] = [];
	private chunkCount = 0;

	constructor(config: VideoExporterConfig) {
		this.config = config;
	}

	async export(): Promise<ExportResult> {
		try {
			this.cleanup();
			this.cancelled = false;

			// Initialize streaming decoder and load video metadata
			this.streamingDecoder = new StreamingVideoDecoder();
			const videoInfo = await this.streamingDecoder.loadMetadata(this.config.videoUrl);

			// Initialize frame renderer
			this.renderer = new FrameRenderer({
				width: this.config.width,
				height: this.config.height,
				wallpaper: this.config.wallpaper,
				zoomRegions: this.config.zoomRegions,
				showShadow: this.config.showShadow,
				shadowIntensity: this.config.shadowIntensity,
				showBlur: this.config.showBlur,
				motionBlurEnabled: this.config.motionBlurEnabled,
				zoomMotionBlur: this.config.zoomMotionBlur,
				connectZooms: this.config.connectZooms,
				borderRadius: this.config.borderRadius,
				padding: this.config.padding,
				cropRegion: this.config.cropRegion,
				videoWidth: videoInfo.width,
				videoHeight: videoInfo.height,
				annotationRegions: this.config.annotationRegions,
				transcriptSegments: this.config.transcriptSegments,
				captionSettings: this.config.captionSettings,
				cursorTelemetry: this.config.cursorTelemetry,
				cursorClickPulseSettings: this.config.cursorClickPulseSettings,
				keystrokeTelemetry: this.config.keystrokeTelemetry,
				keystrokeOverlaySettings: this.config.keystrokeOverlaySettings,
				speedRegions: this.config.speedRegions,
				previewWidth: this.config.previewWidth,
				previewHeight: this.config.previewHeight,
			});
			await this.renderer.initialize();

			// Initialize video encoder
			await this.initializeEncoder();

			// Initialize muxer
			this.muxer = new VideoMuxer(this.config, false);
			await this.muxer.initialize();

			// Calculate effective duration and frame count (excluding trim regions)
			const effectiveDuration = this.streamingDecoder.getEffectiveDuration(
				this.config.trimRegions,
				this.config.speedRegions,
			);
			const totalFrames = Math.ceil(effectiveDuration * this.config.frameRate);

			console.log("[VideoExporter] Original duration:", videoInfo.duration, "s");
			console.log("[VideoExporter] Effective duration:", effectiveDuration, "s");
			console.log("[VideoExporter] Total frames to export:", totalFrames);
			console.log("[VideoExporter] Using streaming decode (web-demuxer + VideoDecoder)");

			const frameDuration = 1_000_000 / this.config.frameRate; // in microseconds
			let frameIndex = 0;

			// Stream decode and process frames — no seeking!
			await this.streamingDecoder.decodeAll(
				this.config.frameRate,
				this.config.trimRegions,
				this.config.speedRegions,
				async (videoFrame, _exportTimestampUs, sourceTimestampMs) => {
					if (this.cancelled) {
						videoFrame.close();
						return;
					}

					const timestamp = frameIndex * frameDuration;

					// Render the frame with all effects using source timestamp
					const sourceTimestampUs = sourceTimestampMs * 1000; // Convert to microseconds
					await this.renderer!.renderFrame(videoFrame, sourceTimestampUs);
					videoFrame.close();

					const canvas = this.renderer!.getCanvas();

					// Create VideoFrame from canvas on GPU without reading pixels
					// @ts-expect-error - colorSpace not in TypeScript definitions but works at runtime
					const exportFrame = new VideoFrame(canvas, {
						timestamp,
						duration: frameDuration,
						colorSpace: {
							primaries: "bt709",
							transfer: "iec61966-2-1",
							matrix: "rgb",
							fullRange: true,
						},
					});

					// Check encoder queue before encoding to keep it full
					while (
						this.encoder &&
						this.encoder.encodeQueueSize >= this.MAX_ENCODE_QUEUE &&
						!this.cancelled
					) {
						await new Promise<void>((resolve) => setTimeout(resolve, 0));
					}

					if (this.encoder && this.encoder.state === "configured") {
						this.encodeQueue++;
						const keyFrameInterval = Math.max(1, Math.round(this.config.frameRate * 2));
					this.encoder.encode(exportFrame, { keyFrame: frameIndex % keyFrameInterval === 0 });
					} else {
						console.warn(`[Frame ${frameIndex}] Encoder not ready! State: ${this.encoder?.state}`);
					}

					exportFrame.close();

					frameIndex++;

					// Update progress
					if (this.config.onProgress) {
						this.config.onProgress({
							currentFrame: frameIndex,
							totalFrames,
							percentage: (frameIndex / totalFrames) * 100,
							estimatedTimeRemaining: 0,
						});
					}
				},
			);

			if (this.encoderError) {
				throw this.encoderError;
			}

			if (this.cancelled) {
				return { success: false, error: "Export cancelled" };
			}

			// Finalize encoding — with timeout to prevent indefinite hang
			if (this.encoder && this.encoder.state === "configured") {
				await Promise.race([
					this.encoder.flush(),
					new Promise<never>((_, reject) =>
						setTimeout(
							() => reject(new Error("Encoder flush timed out after 60s")),
							60_000,
						),
					),
				]);
			}

			// Wait for all muxing operations to complete
			await Promise.all(this.muxingPromises);

			if (this.muxingError) {
				throw this.muxingError;
			}

			// Finalize muxer and get output blob
			const blob = await this.muxer!.finalize();

			return { success: true, blob };
		} catch (error) {
			console.error("Export error:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		} finally {
			this.cleanup();
		}
	}

	private async initializeEncoder(): Promise<void> {
		this.encodeQueue = 0;
		this.muxingPromises = [];
		this.chunkCount = 0;
		let videoDescription: Uint8Array | undefined;

		this.encoder = new VideoEncoder({
			output: (chunk, meta) => {
				// Capture decoder config metadata from encoder output
				if (meta?.decoderConfig?.description && !videoDescription) {
					const desc = meta.decoderConfig.description;
					videoDescription = new Uint8Array(
						desc instanceof ArrayBuffer ? desc : (desc as ArrayBufferLike),
					);
					this.videoDescription = videoDescription;
				}
				// Capture colorSpace from encoder metadata if provided
				if (meta?.decoderConfig?.colorSpace && !this.videoColorSpace) {
					this.videoColorSpace = meta.decoderConfig.colorSpace;
				}

				// Stream chunk to muxer immediately (parallel processing)
				const isFirstChunk = this.chunkCount === 0;
				this.chunkCount++;

				const muxingPromise = (async () => {
					try {
						if (isFirstChunk && this.videoDescription) {
							// Add decoder config for the first chunk
							const colorSpace = this.videoColorSpace || {
								primaries: "bt709",
								transfer: "iec61966-2-1",
								matrix: "rgb",
								fullRange: true,
							};

							const metadata: EncodedVideoChunkMetadata = {
								decoderConfig: {
									codec: this.config.codec || "avc1.640033",
									codedWidth: this.config.width,
									codedHeight: this.config.height,
									description: this.videoDescription,
									colorSpace,
								},
							};

							await this.muxer!.addVideoChunk(chunk, metadata);
						} else {
							await this.muxer!.addVideoChunk(chunk, meta);
						}
					} catch (error) {
						console.error("Muxing error:", error);
						this.muxingError = this.muxingError ?? (error instanceof Error ? error : new Error(String(error)));
					}
				})();

				this.muxingPromises.push(muxingPromise);
				this.encodeQueue--;
			},
			error: (error) => {
				console.error("[VideoExporter] Encoder error:", error);
				this.encoderError = error instanceof Error ? error : new Error(String(error));
				this.cancelled = true;
			},
		});

		const codec = this.config.codec || selectH264Codec(this.config.width, this.config.height, this.config.frameRate);

		const encoderConfig: VideoEncoderConfig = {
			codec,
			width: this.config.width,
			height: this.config.height,
			bitrate: this.config.bitrate,
			framerate: this.config.frameRate,
			latencyMode: "quality", // Changed from 'realtime' to 'quality' for better throughput
			bitrateMode: "variable",
			hardwareAcceleration: "prefer-hardware",
		};

		// Check hardware support first
		const hardwareSupport = await VideoEncoder.isConfigSupported(encoderConfig);

		if (hardwareSupport.supported) {
			// Use hardware encoding
			console.log("[VideoExporter] Using hardware acceleration");
			this.encoder.configure(encoderConfig);
		} else {
			// Fall back to software encoding
			console.log("[VideoExporter] Hardware not supported, using software encoding");
			encoderConfig.hardwareAcceleration = "prefer-software";

			const softwareSupport = await VideoEncoder.isConfigSupported(encoderConfig);
			if (!softwareSupport.supported) {
				throw new Error("Video encoding not supported on this system");
			}

			this.encoder.configure(encoderConfig);
		}
	}

	cancel(): void {
		this.cancelled = true;
		if (this.streamingDecoder) {
			this.streamingDecoder.cancel();
		}
		this.cleanup();
	}

	private cleanup(): void {
		if (this.encoder) {
			try {
				if (this.encoder.state === "configured") {
					this.encoder.close();
				}
			} catch (e) {
				console.warn("Error closing encoder:", e);
			}
			this.encoder = null;
		}

		if (this.streamingDecoder) {
			try {
				this.streamingDecoder.destroy();
			} catch (e) {
				console.warn("Error destroying streaming decoder:", e);
			}
			this.streamingDecoder = null;
		}

		if (this.renderer) {
			try {
				this.renderer.destroy();
			} catch (e) {
				console.warn("Error destroying renderer:", e);
			}
			this.renderer = null;
		}

		this.muxer = null;
		this.encodeQueue = 0;
		this.muxingPromises = [];
		this.chunkCount = 0;
		this.videoDescription = undefined;
		this.videoColorSpace = undefined;
		this.encoderError = null;
		this.muxingError = null;
	}
}
