export interface RecordingClockState {
	startedAtMs: number;
	pausedAtMs: number | null;
	totalPausedMs: number;
}

export function startRecordingClock(nowMs: number): RecordingClockState {
	return {
		startedAtMs: nowMs,
		pausedAtMs: null,
		totalPausedMs: 0,
	};
}

export function pauseRecordingClock(
	state: RecordingClockState,
	nowMs: number,
): RecordingClockState {
	if (state.pausedAtMs !== null) {
		return state;
	}

	return {
		...state,
		pausedAtMs: nowMs,
	};
}

export function resumeRecordingClock(
	state: RecordingClockState,
	nowMs: number,
): RecordingClockState {
	if (state.pausedAtMs === null) {
		return state;
	}

	return {
		startedAtMs: state.startedAtMs,
		pausedAtMs: null,
		totalPausedMs: state.totalPausedMs + Math.max(0, nowMs - state.pausedAtMs),
	};
}

export function getElapsedRecordingTimeMs(state: RecordingClockState | null, nowMs: number) {
	if (!state) {
		return 0;
	}

	const effectiveNowMs = state.pausedAtMs ?? nowMs;
	return Math.max(0, effectiveNowMs - state.startedAtMs - state.totalPausedMs);
}
