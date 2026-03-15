import { type ChildProcessByStdio, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { app } from "electron";

const HELPER_APP_NAME = "KeyboardShortcutMonitor.app";
const HELPER_EXECUTABLE_NAME = "KeyboardShortcutMonitor";

export interface NativeKeyboardShortcutEvent {
	timestampMs: number;
	text: string;
	coalescible: boolean;
}

interface NativeKeyboardMonitorErrorPayload {
	type: "error";
	error: string;
}

interface NativeKeyboardMonitorEventPayload {
	type: "key";
	timestampMs: number;
	text: string;
	coalescible: boolean;
}

type NativeKeyboardMonitorPayload =
	| NativeKeyboardMonitorErrorPayload
	| NativeKeyboardMonitorEventPayload;

async function fileExists(filePath: string) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function resolveKeyboardShortcutMonitorAppPath() {
	const helperAppPath = app.isPackaged
		? path.join(process.resourcesPath, "native-tools", HELPER_APP_NAME)
		: path.join(app.getAppPath(), "build", "native", HELPER_APP_NAME);

	if (await fileExists(helperAppPath)) {
		return helperAppPath;
	}

	throw new Error(
		app.isPackaged
			? "macOS keyboard monitor helper is unavailable in this packaged build."
			: "macOS keyboard monitor helper is unavailable. Run `npm run build:macos-transcriber` before using keystroke overlays in development.",
	);
}

export async function resolveKeyboardShortcutMonitorExecutablePath() {
	const helperAppPath = await resolveKeyboardShortcutMonitorAppPath();
	return path.join(helperAppPath, "Contents", "MacOS", HELPER_EXECUTABLE_NAME);
}

export function parseKeyboardShortcutMonitorLine(
	line: string,
): NativeKeyboardMonitorPayload | null {
	if (!line.trim()) {
		return null;
	}

	let payload: unknown;
	try {
		payload = JSON.parse(line);
	} catch {
		return null;
	}

	if (!payload || typeof payload !== "object") {
		return null;
	}

	const candidate = payload as Partial<NativeKeyboardMonitorPayload>;
	if (candidate.type === "error" && typeof candidate.error === "string") {
		return {
			type: "error",
			error: candidate.error,
		};
	}

	if (
		candidate.type === "key" &&
		typeof candidate.timestampMs === "number" &&
		Number.isFinite(candidate.timestampMs) &&
		typeof candidate.text === "string" &&
		candidate.text.trim().length > 0 &&
		typeof candidate.coalescible === "boolean"
	) {
		return {
			type: "key",
			timestampMs: candidate.timestampMs,
			text: candidate.text,
			coalescible: candidate.coalescible,
		};
	}

	return null;
}

export interface KeyboardShortcutMonitorSession {
	stop: () => Promise<void>;
}

interface StartKeyboardShortcutMonitorOptions {
	onEvent: (event: NativeKeyboardShortcutEvent) => void;
	onError?: (message: string) => void;
}

function drainBufferedLines(buffer: string, onLine: (line: string) => void) {
	const lines = buffer.split(/\r?\n/);
	const trailing = lines.pop() ?? "";
	for (const line of lines) {
		onLine(line);
	}
	return trailing;
}

function stopChildProcess(child: ChildProcessByStdio<null, Readable, Readable>) {
	return new Promise<void>((resolve) => {
		if (child.exitCode !== null || child.killed) {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			child.kill("SIGKILL");
		}, 500);

		child.once("exit", () => {
			clearTimeout(timeout);
			resolve();
		});
		child.kill("SIGTERM");
	});
}

export async function startMacOSKeyboardShortcutMonitor(
	options: StartKeyboardShortcutMonitorOptions,
): Promise<KeyboardShortcutMonitorSession | null> {
	if (process.platform !== "darwin") {
		return null;
	}

	const executablePath = await resolveKeyboardShortcutMonitorExecutablePath();
	const child = spawn(executablePath, [], {
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdoutBuffer = "";
	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		stdoutBuffer = drainBufferedLines(stdoutBuffer + chunk, (line) => {
			const payload = parseKeyboardShortcutMonitorLine(line);
			if (!payload) {
				return;
			}

			if (payload.type === "error") {
				options.onError?.(payload.error);
				return;
			}

			options.onEvent(payload);
		});
	});

	let stderrBuffer = "";
	child.stderr.setEncoding("utf8");
	child.stderr.on("data", (chunk: string) => {
		stderrBuffer += chunk;
	});

	child.on("error", (error) => {
		options.onError?.(error.message);
	});

	child.on("exit", (code) => {
		if (code && code !== 0 && stderrBuffer.trim()) {
			options.onError?.(stderrBuffer.trim());
		}
	});

	return {
		stop: async () => {
			await stopChildProcess(child);
		},
	};
}
