import { fixWebmDuration } from "@fix-webm-duration/fix";
import { useEffect, useRef, useState } from "react";
import { MicrophoneWavCapture } from "../lib/audio/microphoneWavCapture";

// Target visually lossless 4K @ 60fps; fall back gracefully when hardware cannot keep up
const TARGET_FRAME_RATE = 60;
const MIN_FRAME_RATE = 30;
const TARGET_WIDTH = 3840;
const TARGET_HEIGHT = 2160;
const FOUR_K_PIXELS = TARGET_WIDTH * TARGET_HEIGHT;
const QHD_WIDTH = 2560;
const QHD_HEIGHT = 1440;
const QHD_PIXELS = QHD_WIDTH * QHD_HEIGHT;

// Bitrates (bits per second) per resolution tier
const BITRATE_4K = 45_000_000;
const BITRATE_QHD = 28_000_000;
const BITRATE_BASE = 18_000_000;
const HIGH_FRAME_RATE_THRESHOLD = 60;
const HIGH_FRAME_RATE_BOOST = 1.7;

// Fallback track settings when the driver reports nothing
const DEFAULT_WIDTH = 1920;
const DEFAULT_HEIGHT = 1080;

// Codec alignment: VP9/AV1 require dimensions divisible by 2
const CODEC_ALIGNMENT = 2;

const RECORDER_TIMESLICE_MS = 1000;
const BITS_PER_MEGABIT = 1_000_000;
const CHROME_MEDIA_SOURCE = "desktop";
const RECORDING_FILE_PREFIX = "recording-";
const VIDEO_FILE_EXTENSION = ".webm";

export interface UseScreenRecorderOptions {
	/** Pass a device ID (or "default") to mix microphone audio into the recording. */
	micDeviceId?: string | null;
}

type UseScreenRecorderReturn = {
	recording: boolean;
	paused: boolean;
	toggleRecording: () => void;
	togglePauseRecording: () => void;
};

export function useScreenRecorder(options?: UseScreenRecorderOptions): UseScreenRecorderReturn {
	const [recording, setRecording] = useState(false);
	const [paused, setPaused] = useState(false);
	const mediaRecorder = useRef<MediaRecorder | null>(null);
	const stream = useRef<MediaStream | null>(null);
	const micStream = useRef<MediaStream | null>(null);
	const micWavCapture = useRef<MicrophoneWavCapture | null>(null);
	const chunks = useRef<Blob[]>([]);
	const startTime = useRef<number>(0);

	const selectMimeType = () => {
		const preferred = [
			"video/webm;codecs=av1",
			"video/webm;codecs=h264",
			"video/webm;codecs=vp9",
			"video/webm;codecs=vp8",
			"video/webm",
		];

		return preferred.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
	};

	const computeBitrate = (width: number, height: number) => {
		const pixels = width * height;
		const highFrameRateBoost =
			TARGET_FRAME_RATE >= HIGH_FRAME_RATE_THRESHOLD ? HIGH_FRAME_RATE_BOOST : 1;

		if (pixels >= FOUR_K_PIXELS) {
			return Math.round(BITRATE_4K * highFrameRateBoost);
		}

		if (pixels >= QHD_PIXELS) {
			return Math.round(BITRATE_QHD * highFrameRateBoost);
		}

		return Math.round(BITRATE_BASE * highFrameRateBoost);
	};

	const stopRecording = useRef(() => {
		if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
			if (stream.current) {
				stream.current.getTracks().forEach((track) => track.stop());
			}
			if (micStream.current) {
				micStream.current.getTracks().forEach((track) => track.stop());
				micStream.current = null;
			}
			mediaRecorder.current.stop();
			setRecording(false);
			setPaused(false);

			window.electronAPI?.setRecordingState(false);
		}
	});

	useEffect(() => {
		let cleanup: (() => void) | undefined;
		let pauseCleanup: (() => void) | undefined;

		if (window.electronAPI?.onStopRecordingFromTray) {
			cleanup = window.electronAPI.onStopRecordingFromTray(() => {
				stopRecording.current();
			});
		}
		if (window.electronAPI?.onTogglePauseRecordingFromTray) {
			pauseCleanup = window.electronAPI.onTogglePauseRecordingFromTray(() => {
				const recorder = mediaRecorder.current;
				if (!recorder || recorder.state === "inactive") return;
				if (recorder.state === "paused") {
					recorder.resume();
					micWavCapture.current?.resume();
					setPaused(false);
					void window.electronAPI?.setRecordingPaused(false);
				} else if (recorder.state === "recording") {
					recorder.pause();
					micWavCapture.current?.pause();
					setPaused(true);
					void window.electronAPI?.setRecordingPaused(true);
				}
			});
		}

		return () => {
			if (cleanup) cleanup();
			if (pauseCleanup) pauseCleanup();

			if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
				mediaRecorder.current.stop();
			}
			if (stream.current) {
				stream.current.getTracks().forEach((track) => track.stop());
				stream.current = null;
			}
			if (micStream.current) {
				micStream.current.getTracks().forEach((track) => track.stop());
				micStream.current = null;
			}
			if (micWavCapture.current) {
				void micWavCapture.current.cleanup();
				micWavCapture.current = null;
			}
		};
	}, []);

	const startRecording = async () => {
		try {
			const selectedSource = await window.electronAPI.getSelectedSource();
			if (!selectedSource) {
				alert("Please select a source to record");
				return;
			}

			const mediaStream = await (
				navigator.mediaDevices as unknown as {
					getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
				}
			).getUserMedia({
				audio: false,
				video: {
					// @ts-expect-error - Chrome specific constraints are necessary but not well-typed by standard MediaTrackConstraints
					mandatory: {
						chromeMediaSource: CHROME_MEDIA_SOURCE,
						chromeMediaSourceId: (selectedSource as ProcessedDesktopSource).id,
						maxWidth: TARGET_WIDTH,
						maxHeight: TARGET_HEIGHT,
						maxFrameRate: TARGET_FRAME_RATE,
						minFrameRate: MIN_FRAME_RATE,
					},
				},
			});
			stream.current = mediaStream;
			if (!stream.current) {
				throw new Error("Media stream is not available.");
			}
			const videoTrack = stream.current.getVideoTracks()[0];
			try {
				await videoTrack.applyConstraints({
					frameRate: { ideal: TARGET_FRAME_RATE, max: TARGET_FRAME_RATE },
					width: { ideal: TARGET_WIDTH, max: TARGET_WIDTH },
					height: { ideal: TARGET_HEIGHT, max: TARGET_HEIGHT },
				});
			} catch (error) {
				console.warn(
					"Unable to lock 4K/60fps constraints, using best available track settings.",
					error,
				);
			}

			let {
				width = DEFAULT_WIDTH,
				height = DEFAULT_HEIGHT,
				frameRate = TARGET_FRAME_RATE,
			} = videoTrack.getSettings();

			// Ensure dimensions are divisible by 2 for VP9/AV1 codec compatibility
			width = Math.floor(width / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;
			height = Math.floor(height / CODEC_ALIGNMENT) * CODEC_ALIGNMENT;

			// Build the combined stream (video + optional mic audio)
			const combinedStream = new MediaStream([videoTrack]);

			const micDeviceId = options?.micDeviceId;
			if (micDeviceId) {
				try {
					const audioConstraints: MediaTrackConstraints =
						micDeviceId === "default" ? {} : { deviceId: { exact: micDeviceId } };

					const ms = await navigator.mediaDevices.getUserMedia({
						audio: audioConstraints,
						video: false,
					});
					micStream.current = ms;
					ms.getAudioTracks().forEach((t) => combinedStream.addTrack(t));
					const wavCapture = new MicrophoneWavCapture();
					await wavCapture.start(ms);
					micWavCapture.current = wavCapture;
					console.log(`Microphone added: ${ms.getAudioTracks()[0]?.label}`);
				} catch (err) {
					await micWavCapture.current?.cleanup().catch(() => {});
					micWavCapture.current = null;
					console.warn("Could not capture microphone — recording video only:", err);
				}
			}

			const videoBitsPerSecond = computeBitrate(width, height);
			const mimeType = selectMimeType();

			console.log(
				`Recording at ${width}x${height} @ ${frameRate ?? TARGET_FRAME_RATE}fps using ${mimeType} / ${Math.round(
					videoBitsPerSecond / BITS_PER_MEGABIT,
				)} Mbps${micDeviceId ? " + mic" : ""}`,
			);

			chunks.current = [];
			const recorder = new MediaRecorder(combinedStream, {
				mimeType,
				videoBitsPerSecond,
			});
			mediaRecorder.current = recorder;
			recorder.ondataavailable = (e) => {
				if (e.data && e.data.size > 0) chunks.current.push(e.data);
			};
			recorder.onstop = async () => {
				stream.current = null;
				if (chunks.current.length === 0) {
					await micWavCapture.current?.cleanup().catch(() => {});
					micWavCapture.current = null;
					return;
				}
				const duration = Date.now() - startTime.current;
				const recordedChunks = chunks.current;
				const buggyBlob = new Blob(recordedChunks, { type: mimeType });
				const transcriptionAudioBuffer = await micWavCapture.current?.stop().catch((error) => {
					console.warn("Failed to prepare microphone WAV sidecar:", error);
					return null;
				});
				micWavCapture.current = null;
				// Clear chunks early to free memory immediately after blob creation
				chunks.current = [];
				const timestamp = Date.now();
				const videoFileName = `${RECORDING_FILE_PREFIX}${timestamp}${VIDEO_FILE_EXTENSION}`;

				try {
					const videoBlob = await fixWebmDuration(buggyBlob, duration);
					const arrayBuffer = await videoBlob.arrayBuffer();
					const videoResult = await window.electronAPI.storeRecordedVideo(
						arrayBuffer,
						videoFileName,
					);
					if (!videoResult.success) {
						console.error("Failed to store video:", videoResult.message);
						return;
					}

					if (videoResult.path) {
						await window.electronAPI.setCurrentVideoPath(videoResult.path);
						if (transcriptionAudioBuffer) {
							const audioResult = await window.electronAPI.storeRecordedTranscriptionAudio(
								transcriptionAudioBuffer,
								videoResult.path,
							);
							if (!audioResult.success) {
								console.warn(
									"Failed to store transcription audio sidecar:",
									audioResult.message ?? audioResult.error,
								);
							}
						}
					}

					await window.electronAPI.switchToEditor();
				} catch (error) {
					console.error("Error saving recording:", error);
				}
			};
			recorder.onerror = () => {
				setRecording(false);
				setPaused(false);
			};
			recorder.start(RECORDER_TIMESLICE_MS);
			startTime.current = Date.now();
			setRecording(true);
			setPaused(false);
			window.electronAPI?.setRecordingState(true);
		} catch (error) {
			console.error("Failed to start recording:", error);
			setRecording(false);
			setPaused(false);
			if (stream.current) {
				stream.current.getTracks().forEach((track) => track.stop());
				stream.current = null;
			}
			if (micStream.current) {
				micStream.current.getTracks().forEach((track) => track.stop());
				micStream.current = null;
			}
			if (micWavCapture.current) {
				await micWavCapture.current.cleanup().catch(() => {});
				micWavCapture.current = null;
			}
		}
	};

	const toggleRecording = () => {
		recording ? stopRecording.current() : startRecording();
	};

	const togglePauseRecording = () => {
		const recorder = mediaRecorder.current;
		if (!recorder || recorder.state === "inactive") {
			return;
		}

		if (recorder.state === "paused") {
			recorder.resume();
			micWavCapture.current?.resume();
			setPaused(false);
			void window.electronAPI?.setRecordingPaused(false);
		} else if (recorder.state === "recording") {
			recorder.pause();
			micWavCapture.current?.pause();
			setPaused(true);
			void window.electronAPI?.setRecordingPaused(true);
		}
	};

	return { recording, paused, toggleRecording, togglePauseRecording };
}
