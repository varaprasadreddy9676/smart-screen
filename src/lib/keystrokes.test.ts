import { describe, expect, it } from "vitest";
import { DEFAULT_KEYSTROKE_OVERLAY_SETTINGS } from "@/components/video-editor/types";
import { getActiveKeystrokeCue } from "./keystrokes";

describe("keystrokes", () => {
	it("returns the latest active keystroke cue in range", () => {
		const cue = getActiveKeystrokeCue(
			[
				{ timeMs: 1000, text: "⌘K" },
				{ timeMs: 2200, text: "⇧⌘P" },
			],
			2500,
			DEFAULT_KEYSTROKE_OVERLAY_SETTINGS,
		);

		expect(cue).toEqual({
			text: "⇧⌘P",
			startMs: 2200,
			endMs: 3600,
		});
	});

	it("returns null when no keystroke is active", () => {
		expect(
			getActiveKeystrokeCue(
				[{ timeMs: 1000, text: "⌘K" }],
				5000,
				DEFAULT_KEYSTROKE_OVERLAY_SETTINGS,
			),
		).toBeNull();
	});
});
