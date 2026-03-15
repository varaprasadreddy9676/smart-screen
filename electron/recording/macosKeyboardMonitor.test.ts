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
	parseKeyboardShortcutMonitorLine,
	resolveKeyboardShortcutMonitorAppPath,
	resolveKeyboardShortcutMonitorExecutablePath,
} from "./macosKeyboardMonitor";

describe("macosKeyboardMonitor", () => {
	beforeEach(() => {
		accessMock.mockReset();
		appMock.isPackaged = false;
		appMock.getAppPath.mockReturnValue("/workspace");
	});

	it("parses keystroke event lines from the native helper", () => {
		expect(
			parseKeyboardShortcutMonitorLine(
				'{"type":"key","timestampMs":123,"text":"Cmd+Shift+P","coalescible":false}',
			),
		).toEqual({
			type: "key",
			timestampMs: 123,
			text: "Cmd+Shift+P",
			coalescible: false,
		});
	});

	it("ignores invalid helper output lines", () => {
		expect(parseKeyboardShortcutMonitorLine("not json")).toBeNull();
		expect(parseKeyboardShortcutMonitorLine('{"type":"key","timestampMs":"bad"}')).toBeNull();
	});

	it("resolves helper app and executable paths in development", async () => {
		accessMock.mockResolvedValue(undefined);

		await expect(resolveKeyboardShortcutMonitorAppPath()).resolves.toBe(
			"/workspace/build/native/KeyboardShortcutMonitor.app",
		);
		await expect(resolveKeyboardShortcutMonitorExecutablePath()).resolves.toBe(
			"/workspace/build/native/KeyboardShortcutMonitor.app/Contents/MacOS/KeyboardShortcutMonitor",
		);
	});
});
