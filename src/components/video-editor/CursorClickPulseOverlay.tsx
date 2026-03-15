import { getCursorClickPulseVisual } from "@/lib/cursorEnhancements";
import type { CursorClickPulseSettings } from "./types";

interface CursorClickPulseOverlayProps {
	point: { x: number; y: number };
	progress: number;
	settings: CursorClickPulseSettings;
	containerHeight: number;
}

export function CursorClickPulseOverlay({
	point,
	progress,
	settings,
	containerHeight,
}: CursorClickPulseOverlayProps) {
	const scaleFactor = Math.max(0.65, containerHeight / 1080);
	const visual = getCursorClickPulseVisual(progress, settings.size * scaleFactor);

	return (
		<div
			className="absolute pointer-events-none"
			style={{
				left: `${point.x}px`,
				top: `${point.y}px`,
				width: 0,
				height: 0,
				transform: "translate(-50%, -50%)",
				zIndex: 1980,
			}}
		>
			<div
				className="absolute rounded-full"
				style={{
					left: "50%",
					top: "50%",
					width: `${visual.haloRadiusPx * 2}px`,
					height: `${visual.haloRadiusPx * 2}px`,
					marginLeft: `${-visual.haloRadiusPx}px`,
					marginTop: `${-visual.haloRadiusPx}px`,
					backgroundColor: settings.color,
					opacity: visual.haloOpacity,
					filter: `blur(${Math.max(10, visual.haloRadiusPx * 0.35)}px)`,
				}}
			/>
			<div
				className="absolute rounded-full border-[3px]"
				style={{
					left: "50%",
					top: "50%",
					width: `${visual.ringRadiusPx * 2}px`,
					height: `${visual.ringRadiusPx * 2}px`,
					marginLeft: `${-visual.ringRadiusPx}px`,
					marginTop: `${-visual.ringRadiusPx}px`,
					borderColor: settings.color,
					opacity: visual.ringOpacity,
				}}
			/>
			<div
				className="absolute rounded-full"
				style={{
					left: "50%",
					top: "50%",
					width: `${visual.dotRadiusPx * 2}px`,
					height: `${visual.dotRadiusPx * 2}px`,
					marginLeft: `${-visual.dotRadiusPx}px`,
					marginTop: `${-visual.dotRadiusPx}px`,
					backgroundColor: settings.color,
					opacity: visual.dotOpacity,
				}}
			/>
		</div>
	);
}
