import type { SmartDemoAIFrameSample } from "@shared/ai";

interface SampleFramesOptions {
	frameCount?: number;
	jpegQuality?: number;
}

function waitForEvent(target: EventTarget, eventName: string) {
	return new Promise<void>((resolve, reject) => {
		const handleEvent = () => {
			cleanup();
			resolve();
		};

		const handleError = () => {
			cleanup();
			reject(new Error(`Video failed while waiting for "${eventName}".`));
		};

		const cleanup = () => {
			target.removeEventListener(eventName, handleEvent);
			target.removeEventListener("error", handleError);
		};

		target.addEventListener(eventName, handleEvent, { once: true });
		target.addEventListener("error", handleError, { once: true });
	});
}

async function ensureSeekable(video: HTMLVideoElement) {
	if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.duration > 0) {
		return;
	}

	await waitForEvent(video, "loadedmetadata");
}

async function seekVideo(video: HTMLVideoElement, timeSeconds: number) {
	const clamped = Math.max(
		0,
		Math.min(timeSeconds, Number.isFinite(video.duration) ? video.duration : timeSeconds),
	);
	if (Math.abs(video.currentTime - clamped) < 0.01) {
		return;
	}

	const seeked = waitForEvent(video, "seeked");
	video.currentTime = clamped;
	await seeked;
}

function buildSampleTimes(durationSeconds: number, frameCount: number) {
	if (durationSeconds <= 0 || frameCount <= 0) {
		return [];
	}

	const segmentSize = durationSeconds / (frameCount + 1);
	return Array.from({ length: frameCount }, (_, index) => segmentSize * (index + 1));
}

export async function sampleFramesFromVideo(
	video: HTMLVideoElement,
	options: SampleFramesOptions = {},
): Promise<SmartDemoAIFrameSample[]> {
	await ensureSeekable(video);

	const { frameCount = 6, jpegQuality = 0.72 } = options;
	if (video.videoWidth <= 0 || video.videoHeight <= 0) {
		throw new Error("Video is not ready for AI frame sampling.");
	}

	const previousTime = video.currentTime;
	const canvas = document.createElement("canvas");
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;

	const context = canvas.getContext("2d");
	if (!context) {
		throw new Error("Unable to create a 2D canvas context for AI frame sampling.");
	}

	const sampleTimes = buildSampleTimes(video.duration, frameCount);
	const samples: SmartDemoAIFrameSample[] = [];

	for (const sampleTime of sampleTimes) {
		await seekVideo(video, sampleTime);
		context.drawImage(video, 0, 0, canvas.width, canvas.height);

		const dataUrl = canvas.toDataURL("image/jpeg", jpegQuality);
		samples.push({
			timestampMs: Math.round(sampleTime * 1000),
			mimeType: "image/jpeg",
			dataUrl,
		});
	}

	await seekVideo(video, previousTime);
	return samples;
}
