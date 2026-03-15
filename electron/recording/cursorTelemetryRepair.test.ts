import { describe, expect, it } from "vitest";
import { repairLegacyNativeClickScale } from "./cursorTelemetryRepair";

describe("cursorTelemetryRepair", () => {
	it("repairs legacy native click coordinates that were stored at half scale", () => {
		const repaired = repairLegacyNativeClickScale([
			{ timeMs: 100, cx: 0.5, cy: 0.4, kind: "move", source: "sampled" },
			{ timeMs: 105, cx: 0.25, cy: 0.2, kind: "click", phase: "down", source: "native" },
			{ timeMs: 140, cx: 0.25, cy: 0.2, kind: "click", phase: "up", source: "native" },
			{ timeMs: 300, cx: 0.6, cy: 0.5, kind: "move", source: "sampled" },
			{ timeMs: 310, cx: 0.3, cy: 0.25, kind: "click", phase: "down", source: "native" },
			{ timeMs: 500, cx: 0.7, cy: 0.55, kind: "move", source: "sampled" },
			{ timeMs: 510, cx: 0.35, cy: 0.275, kind: "click", phase: "down", source: "native" },
			{ timeMs: 700, cx: 0.8, cy: 0.65, kind: "move", source: "sampled" },
			{ timeMs: 705, cx: 0.4, cy: 0.325, kind: "click", phase: "down", source: "native" },
		]);

		const repairedClicks = repaired.filter((sample) => sample.kind === "click");
		expect(repairedClicks[0]?.cx).toBeCloseTo(0.5);
		expect(repairedClicks[0]?.cy).toBeCloseTo(0.4);
		expect(repairedClicks[1]?.cx).toBeCloseTo(0.5);
		expect(repairedClicks[1]?.cy).toBeCloseTo(0.4);
	});

	it("leaves correctly scaled click telemetry unchanged", () => {
		const samples = [
			{ timeMs: 100, cx: 0.5, cy: 0.4, kind: "move", source: "sampled" as const },
			{ timeMs: 105, cx: 0.48, cy: 0.39, kind: "click" as const, phase: "down" as const, source: "native" as const },
			{ timeMs: 300, cx: 0.6, cy: 0.5, kind: "move", source: "sampled" as const },
			{ timeMs: 310, cx: 0.58, cy: 0.49, kind: "click" as const, phase: "down" as const, source: "native" as const },
			{ timeMs: 500, cx: 0.7, cy: 0.55, kind: "move", source: "sampled" as const },
			{ timeMs: 510, cx: 0.69, cy: 0.54, kind: "click" as const, phase: "down" as const, source: "native" as const },
			{ timeMs: 700, cx: 0.8, cy: 0.65, kind: "move", source: "sampled" as const },
			{ timeMs: 705, cx: 0.79, cy: 0.64, kind: "click" as const, phase: "down" as const, source: "native" as const },
		];

		expect(repairLegacyNativeClickScale(samples)).toEqual(samples);
	});
});
