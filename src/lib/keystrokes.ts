import type {
	KeystrokeOverlaySettings,
	KeystrokeTelemetryEvent,
} from "@/components/video-editor/types";

export interface ActiveKeystrokeCue {
	text: string;
	startMs: number;
	endMs: number;
}

export function getActiveKeystrokeCue(
	events: KeystrokeTelemetryEvent[],
	timeMs: number,
	settings: KeystrokeOverlaySettings,
): ActiveKeystrokeCue | null {
	for (let index = events.length - 1; index >= 0; index -= 1) {
		const event = events[index];
		if (!event || !event.text.trim()) {
			continue;
		}

		const startMs = Math.max(0, event.timeMs);
		const endMs = startMs + Math.max(300, settings.durationMs);
		if (timeMs >= startMs && timeMs <= endMs) {
			return {
				text: event.text,
				startMs,
				endMs,
			};
		}

		if (timeMs > endMs) {
			return null;
		}
	}

	return null;
}
