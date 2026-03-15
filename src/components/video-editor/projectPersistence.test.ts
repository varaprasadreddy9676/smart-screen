import { normalizeProjectEditor } from "./projectPersistence";

describe("projectPersistence", () => {
	it("normalizes transcript segments in saved projects", () => {
		const normalized = normalizeProjectEditor({
			transcriptSegments: [
				{
					startMs: -50,
					endMs: 750,
					text: "Open settings",
					confidence: 2,
				},
				{
					startMs: 1000,
					endMs: 900,
					text: "Look at the chart",
				},
			],
			captionSettings: {
				showInPreview: true,
				burnInDuringExport: true,
				fontSize: 200,
				bottomOffset: -5,
				maxWidthPercent: 150,
				textColor: "#fefefe",
				backgroundColor: "rgba(0,0,0,0.9)",
			},
			cursorClickPulseSettings: {
				showInPreview: false,
				burnInDuringExport: true,
				durationMs: 50,
				size: 5,
				color: "#7dd3fc",
			},
			connectZooms: false,
			zoomMotionBlur: 4,
			keystrokeOverlaySettings: {
				showInPreview: false,
				burnInDuringExport: true,
				durationMs: 5000,
				fontSize: 100,
				bottomOffset: 2,
				textColor: "#abcdef",
				backgroundColor: "rgba(1,2,3,0.8)",
			},
		});

		expect(normalized.transcriptSegments).toEqual([
			{
				id: "transcript-1",
				startMs: 0,
				endMs: 750,
				text: "Open settings",
				confidence: 1,
			},
			{
				id: "transcript-2",
				startMs: 1000,
				endMs: 1001,
				text: "Look at the chart",
			},
		]);
		expect(normalized.captionSettings).toEqual({
			showInPreview: true,
			burnInDuringExport: true,
			fontSize: 72,
			bottomOffset: 2,
			maxWidthPercent: 95,
			textColor: "#fefefe",
			backgroundColor: "rgba(0,0,0,0.9)",
		});
		expect(normalized.cursorClickPulseSettings).toEqual({
			showInPreview: false,
			burnInDuringExport: true,
			durationMs: 220,
			size: 1.75,
			color: "#7dd3fc",
		});
		expect(normalized.connectZooms).toBe(false);
		expect(normalized.zoomMotionBlur).toBe(1);
		expect(normalized.keystrokeOverlaySettings).toEqual({
			showInPreview: false,
			burnInDuringExport: true,
			durationMs: 3000,
			fontSize: 48,
			bottomOffset: 6,
			textColor: "#abcdef",
			backgroundColor: "rgba(1,2,3,0.8)",
		});
	});
});
