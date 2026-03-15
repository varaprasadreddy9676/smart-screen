import type { CaptionSettings } from "./types";

interface TranscriptCaptionOverlayProps {
	text: string;
	settings: CaptionSettings;
	containerHeight: number;
}

export function TranscriptCaptionOverlay({
	text,
	settings,
	containerHeight,
}: TranscriptCaptionOverlayProps) {
	const scaleFactor = Math.max(0.65, containerHeight / 1080);
	const fontSize = Math.round(settings.fontSize * scaleFactor);

	return (
		<div
			className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
			style={{
				bottom: `${settings.bottomOffset}%`,
				width: `${settings.maxWidthPercent}%`,
				zIndex: 2000,
			}}
		>
			<div
				className="mx-auto w-fit max-w-full rounded-xl px-4 py-2 text-center font-semibold leading-[1.35] shadow-[0_8px_24px_rgba(0,0,0,0.18)]"
				style={{
					color: settings.textColor,
					backgroundColor: settings.backgroundColor,
					fontSize: `${fontSize}px`,
					whiteSpace: "pre-wrap",
					overflowWrap: "break-word",
				}}
			>
				{text}
			</div>
		</div>
	);
}
