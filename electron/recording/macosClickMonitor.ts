import { type ChildProcessByStdio, execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { promisify } from "node:util";
import { app } from "electron";

const HELPER_APP_NAME = "MouseClickMonitor.app";
const HELPER_EXECUTABLE_NAME = "MouseClickMonitor";
const execFileAsync = promisify(execFile);

export interface NativeMouseClickEvent {
	timestampMs: number;
	x: number;
	y: number;
	button: "left" | "right" | "middle" | "other";
	phase: "down" | "up";
}

interface NativeMouseMonitorErrorPayload {
	type: "error";
	error: string;
}

interface NativeMouseMonitorEventPayload {
	type: "mouse";
	timestampMs: number;
	x: number;
	y: number;
	button: "left" | "right" | "middle" | "other";
	phase: "down" | "up";
}

type NativeMouseMonitorPayload = NativeMouseMonitorErrorPayload | NativeMouseMonitorEventPayload;

interface NativeMouseMonitorStatusPayload {
	type: "status";
	trusted: boolean;
	prompted: boolean;
}

export interface NativeClickCaptureStatus {
	supported: boolean;
	helperAvailable: boolean;
	permissionGranted: boolean;
	reason?: string;
}

async function fileExists(filePath: string) {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

export async function resolveMouseClickMonitorAppPath() {
	const helperAppPath = app.isPackaged
		? path.join(process.resourcesPath, "native-tools", HELPER_APP_NAME)
		: path.join(app.getAppPath(), "build", "native", HELPER_APP_NAME);

	if (await fileExists(helperAppPath)) {
		return helperAppPath;
	}

	throw new Error(
		app.isPackaged
			? "macOS mouse monitor helper is unavailable in this packaged build."
			: "macOS mouse monitor helper is unavailable. Run `npm run build:macos-transcriber` before using native click capture in development.",
	);
}

export async function resolveMouseClickMonitorExecutablePath() {
	const helperAppPath = await resolveMouseClickMonitorAppPath();
	return path.join(helperAppPath, "Contents", "MacOS", HELPER_EXECUTABLE_NAME);
}

export function parseMouseClickMonitorLine(line: string): NativeMouseMonitorPayload | null {
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

	const candidate = payload as Partial<NativeMouseMonitorPayload>;
	if (candidate.type === "error" && typeof candidate.error === "string") {
		return {
			type: "error",
			error: candidate.error,
		};
	}

	if (
		candidate.type === "mouse" &&
		typeof candidate.timestampMs === "number" &&
		Number.isFinite(candidate.timestampMs) &&
		typeof candidate.x === "number" &&
		Number.isFinite(candidate.x) &&
		typeof candidate.y === "number" &&
		Number.isFinite(candidate.y) &&
		(candidate.button === "left" ||
			candidate.button === "right" ||
			candidate.button === "middle" ||
			candidate.button === "other") &&
		(candidate.phase === "down" || candidate.phase === "up")
	) {
		return {
			type: "mouse",
			timestampMs: candidate.timestampMs,
			x: candidate.x,
			y: candidate.y,
			button: candidate.button,
			phase: candidate.phase,
		};
	}

	return null;
}

export function parseMouseClickMonitorStatus(
	output: string,
): NativeMouseMonitorStatusPayload | null {
	if (!output.trim()) {
		return null;
	}

	let payload: unknown;
	try {
		payload = JSON.parse(output);
	} catch {
		return null;
	}

	if (
		payload &&
		typeof payload === "object" &&
		(payload as Partial<NativeMouseMonitorStatusPayload>).type === "status" &&
		typeof (payload as Partial<NativeMouseMonitorStatusPayload>).trusted === "boolean" &&
		typeof (payload as Partial<NativeMouseMonitorStatusPayload>).prompted === "boolean"
	) {
		return payload as NativeMouseMonitorStatusPayload;
	}

	return null;
}

export interface MouseClickMonitorSession {
	stop: () => Promise<void>;
}

interface StartMouseClickMonitorOptions {
	onEvent: (event: NativeMouseClickEvent) => void;
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

export async function startMacOSMouseClickMonitor(
	options: StartMouseClickMonitorOptions,
): Promise<MouseClickMonitorSession | null> {
	if (process.platform !== "darwin") {
		return null;
	}

	const executablePath = await resolveMouseClickMonitorExecutablePath();
	const child = spawn(executablePath, [], {
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stdoutBuffer = "";
	const handlePayload = (payload: NativeMouseMonitorPayload) => {
		if (payload.type === "error") {
			options.onError?.(payload.error);
			return;
		}

		options.onEvent(payload);
	};

	child.stdout.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		stdoutBuffer = drainBufferedLines(stdoutBuffer + chunk, (line) => {
			const payload = parseMouseClickMonitorLine(line);
			if (payload) {
				handlePayload(payload);
			}
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

async function queryNativeClickCaptureStatus(prompt: boolean): Promise<NativeClickCaptureStatus> {
	if (process.platform !== "darwin") {
		return {
			supported: false,
			helperAvailable: false,
			permissionGranted: false,
			reason: "Native click capture is only available on macOS.",
		};
	}

	let executablePath: string;
	try {
		executablePath = await resolveMouseClickMonitorExecutablePath();
	} catch (error) {
		return {
			supported: true,
			helperAvailable: false,
			permissionGranted: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}

	try {
		const { stdout } = await execFileAsync(executablePath, [
			prompt ? "--prompt-accessibility" : "--check-accessibility",
		]);
		const payload = parseMouseClickMonitorStatus(stdout);
		if (!payload) {
			return {
				supported: true,
				helperAvailable: true,
				permissionGranted: false,
				reason: "Native click helper returned an invalid accessibility status response.",
			};
		}

		return {
			supported: true,
			helperAvailable: true,
			permissionGranted: payload.trusted,
			reason: payload.trusted
				? undefined
				: "Enable Accessibility access to capture precise native mouse clicks during recording.",
		};
	} catch (error) {
		return {
			supported: true,
			helperAvailable: true,
			permissionGranted: false,
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function getNativeClickCaptureStatus() {
	return queryNativeClickCaptureStatus(false);
}

export async function requestNativeClickCaptureAccess() {
	return queryNativeClickCaptureStatus(true);
}
