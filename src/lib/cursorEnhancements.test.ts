import {
	getActiveCursorClickPulse,
	getCursorClickPulseVisual,
	projectCursorPointToStage,
} from "./cursorEnhancements";

describe("cursorEnhancements", () => {
	it("returns the latest active click-down pulse within the visible window", () => {
		const pulse = getActiveCursorClickPulse(
			[
				{ timeMs: 100, cx: 0.1, cy: 0.1, kind: "click", phase: "down", source: "sampled" },
				{ timeMs: 160, cx: 0.1, cy: 0.1, kind: "click", phase: "up", source: "sampled" },
				{ timeMs: 600, cx: 0.72, cy: 0.38, kind: "click", phase: "down", source: "native" },
			],
			760,
			{
				showInPreview: true,
				burnInDuringExport: true,
				durationMs: 220,
				size: 1,
				color: "#34B27B",
			},
		);

		expect(pulse).not.toBeNull();
		expect(pulse?.timeMs).toBe(600);
		expect(pulse?.cx).toBe(0.72);
		expect(pulse?.cy).toBe(0.38);
		expect(pulse?.source).toBe("native");
		expect(pulse?.progress).toBeCloseTo((760 - 600) / 220);
	});

	it("returns null when the latest click pulse has already expired", () => {
		const pulse = getActiveCursorClickPulse(
			[{ timeMs: 100, cx: 0.5, cy: 0.5, kind: "click", phase: "down" }],
			700,
			{
				showInPreview: true,
				burnInDuringExport: true,
				durationMs: 300,
				size: 1,
				color: "#34B27B",
			},
		);

		expect(pulse).toBeNull();
	});

	it("projects a source-space cursor point through the current zoom camera", () => {
		const projected = projectCursorPointToStage({
			point: { cx: 0.75, cy: 0.25 },
			stageSize: { width: 1000, height: 600 },
			baseScale: 0.5,
			baseOffset: { x: 50, y: 40 },
			sourceVideoSize: { width: 1600, height: 900 },
			zoomScale: 1.4,
			focus: { cx: 0.5, cy: 0.5 },
		});

		expect(projected).toEqual({
			x: 710,
			y: 93.5,
		});
	});

	it("computes a fading pulse visual over time", () => {
		const start = getCursorClickPulseVisual(0, 1);
		const end = getCursorClickPulseVisual(1, 1);

		expect(start.haloOpacity).toBeGreaterThan(end.haloOpacity);
		expect(start.ringOpacity).toBeGreaterThan(end.ringOpacity);
		expect(end.dotOpacity).toBeLessThan(start.dotOpacity);
	});
});
