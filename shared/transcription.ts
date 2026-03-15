export const TRANSCRIPTION_AUDIO_SIDECAR_SUFFIX = ".transcription.wav";

export function getTranscriptionAudioSidecarPath(mediaPath: string) {
	return `${mediaPath}${TRANSCRIPTION_AUDIO_SIDECAR_SUFFIX}`;
}
