import { describe, expect, it } from "vitest";
import {
	getElapsedRecordingTimeMs,
	pauseRecordingClock,
	resumeRecordingClock,
	startRecordingClock,
} from "./recordingClock";

describe("recordingClock", () => {
	it("tracks elapsed time while active", () => {
		const clock = startRecordingClock(1000);
		expect(getElapsedRecordingTimeMs(clock, 1600)).toBe(600);
	});

	it("freezes elapsed time while paused", () => {
		const paused = pauseRecordingClock(startRecordingClock(1000), 1500);
		expect(getElapsedRecordingTimeMs(paused, 2400)).toBe(500);
	});

	it("subtracts the paused interval after resume", () => {
		const paused = pauseRecordingClock(startRecordingClock(1000), 1500);
		const resumed = resumeRecordingClock(paused, 2200);
		expect(getElapsedRecordingTimeMs(resumed, 2600)).toBe(900);
	});
});
