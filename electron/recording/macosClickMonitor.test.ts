const { accessMock, appMock } = vi.hoisted(() => ({
	accessMock: vi.fn(),
	appMock: {
		isPackaged: false,
		getAppPath: vi.fn(() => "/workspace"),
	},
}));

vi.mock("electron", () => ({
	app: appMock,
}));

vi.mock("node:fs/promises", () => ({
	default: {
		access: accessMock,
	},
	access: accessMock,
}));

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	parseMouseClickMonitorLine,
	parseMouseClickMonitorStatus,
	resolveMouseClickMonitorAppPath,
	resolveMouseClickMonitorExecutablePath,
} from "./macosClickMonitor";

describe("macosClickMonitor", () => {
	beforeEach(() => {
		accessMock.mockReset();
		appMock.isPackaged = false;
		appMock.getAppPath.mockReturnValue("/workspace");
	});

	it("parses mouse event lines from the native helper", () => {
		expect(
			parseMouseClickMonitorLine(
				'{"type":"mouse","timestampMs":123,"x":100.5,"y":200.25,"button":"left","phase":"down"}',
			),
		).toEqual({
			type: "mouse",
			timestampMs: 123,
			x: 100.5,
			y: 200.25,
			button: "left",
			phase: "down",
		});
	});

	it("ignores invalid helper output lines", () => {
		expect(parseMouseClickMonitorLine("not json")).toBeNull();
		expect(parseMouseClickMonitorLine('{"type":"mouse","timestampMs":"bad"}')).toBeNull();
	});

	it("parses accessibility status responses from the helper", () => {
		expect(
			parseMouseClickMonitorStatus('{"type":"status","trusted":true,"prompted":false}'),
		).toEqual({
			type: "status",
			trusted: true,
			prompted: false,
		});
		expect(parseMouseClickMonitorStatus('{"type":"status","trusted":"bad"}')).toBeNull();
	});

	it("resolves helper app and executable paths in development", async () => {
		accessMock.mockResolvedValue(undefined);

		await expect(resolveMouseClickMonitorAppPath()).resolves.toBe(
			"/workspace/build/native/MouseClickMonitor.app",
		);
		await expect(resolveMouseClickMonitorExecutablePath()).resolves.toBe(
			"/workspace/build/native/MouseClickMonitor.app/Contents/MacOS/MouseClickMonitor",
		);
	});
});
