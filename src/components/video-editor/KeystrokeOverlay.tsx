import type { KeystrokeOverlaySettings } from "./types";

interface KeystrokeOverlayProps {
	text: string;
	settings: KeystrokeOverlaySettings;
	containerHeight: number;
}

export function KeystrokeOverlay({ text, settings, containerHeight }: KeystrokeOverlayProps) {
	const scaleFactor = Math.max(0.65, containerHeight / 1080);
	const fontSize = Math.round(settings.fontSize * scaleFactor);

	return (
		<div
			className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
			style={{
				bottom: `${settings.bottomOffset}%`,
				zIndex: 1990,
			}}
		>
			<div
				className="mx-auto rounded-2xl px-4 py-2 text-center font-semibold tracking-wide shadow-[0_10px_30px_rgba(0,0,0,0.35)]"
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
