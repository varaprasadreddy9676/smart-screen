interface PointLike {
	x: number;
	y: number;
}

interface BoundsLike {
	x: number;
	y: number;
	width: number;
	height: number;
}

interface DisplayLike {
	id: number;
	bounds: BoundsLike;
	scaleFactor?: number;
	nativeOrigin?: PointLike;
}

interface SelectedSourceLike {
	id?: unknown;
	display_id?: unknown;
}

interface DisplaySelectionOptions {
	pointDip: PointLike;
	selectedSource: SelectedSourceLike | null;
	displays: DisplayLike[];
	getNearestDisplay: (point: PointLike) => DisplayLike;
}

interface NativePointNormalizationOptions {
	selectedSource: SelectedSourceLike | null;
	displays: DisplayLike[];
	getNearestDisplay: (point: PointLike) => DisplayLike;
	pointPhysical: PointLike;
	screenToDipPoint?: ((point: PointLike) => PointLike) | null;
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function isScreenSource(selectedSource: SelectedSourceLike | null) {
	return typeof selectedSource?.id === "string" && selectedSource.id.startsWith("screen:");
}

function getSelectedDisplay(
	selectedSource: SelectedSourceLike | null,
	displays: DisplayLike[],
): DisplayLike | null {
	const sourceDisplayId = Number(selectedSource?.display_id);
	if (!Number.isFinite(sourceDisplayId)) {
		return null;
	}

	return displays.find((display) => display.id === sourceDisplayId) ?? null;
}

export function pickDisplayForTelemetry({
	pointDip,
	selectedSource,
	displays,
	getNearestDisplay,
}: DisplaySelectionOptions): DisplayLike {
	if (isScreenSource(selectedSource)) {
		const selectedDisplay = getSelectedDisplay(selectedSource, displays);
		if (selectedDisplay) {
			return selectedDisplay;
		}
	}

	return getNearestDisplay(pointDip);
}

export function normalizeDipPointWithinDisplay(pointDip: PointLike, display: DisplayLike) {
	const width = Math.max(1, display.bounds.width);
	const height = Math.max(1, display.bounds.height);

	return {
		cx: clamp((pointDip.x - display.bounds.x) / width, 0, 1),
		cy: clamp((pointDip.y - display.bounds.y) / height, 0, 1),
	};
}

export function normalizeCursorDipPoint(options: DisplaySelectionOptions) {
	const display = pickDisplayForTelemetry(options);
	return normalizeDipPointWithinDisplay(options.pointDip, display);
}

export function normalizeNativeScreenPoint(options: NativePointNormalizationOptions) {
	const pointDip = convertNativePointToDip(
		options.pointPhysical,
		options.displays,
		options.screenToDipPoint,
	);
	return normalizeCursorDipPoint({
		pointDip,
		selectedSource: options.selectedSource,
		displays: options.displays,
		getNearestDisplay: options.getNearestDisplay,
	});
}

function resolvePhysicalBounds(display: DisplayLike) {
	const scaleFactor = Math.max(1, display.scaleFactor ?? 1);
	const nativeOrigin = display.nativeOrigin ?? {
		x: display.bounds.x * scaleFactor,
		y: display.bounds.y * scaleFactor,
	};

	return {
		x: nativeOrigin.x,
		y: nativeOrigin.y,
		width: display.bounds.width * scaleFactor,
		height: display.bounds.height * scaleFactor,
		scaleFactor,
	};
}

function pointInsideBounds(point: PointLike, bounds: BoundsLike) {
	return (
		point.x >= bounds.x &&
		point.x < bounds.x + bounds.width &&
		point.y >= bounds.y &&
		point.y < bounds.y + bounds.height
	);
}

function fallbackScreenPointToDip(pointPhysical: PointLike, displays: DisplayLike[]) {
	const display =
		displays.find((candidate) =>
			pointInsideBounds(pointPhysical, resolvePhysicalBounds(candidate)),
		) ?? displays[0];
	const scaleFactor = Math.max(1, display?.scaleFactor ?? 1);
	const physicalBounds = display
		? resolvePhysicalBounds(display)
		: { x: 0, y: 0, width: 1, height: 1 };
	const dipBounds = display?.bounds ?? { x: 0, y: 0, width: 1, height: 1 };

	return {
		x: dipBounds.x + (pointPhysical.x - physicalBounds.x) / scaleFactor,
		y: dipBounds.y + (pointPhysical.y - physicalBounds.y) / scaleFactor,
	};
}

function pointMatchesLogicalDisplayBounds(point: PointLike, displays: DisplayLike[]) {
	return displays.some((display) => pointInsideBounds(point, display.bounds));
}

export function convertNativePointToDip(
	pointPhysical: PointLike,
	displays: DisplayLike[],
	screenToDipPoint?: ((point: PointLike) => PointLike) | null,
) {
	if (typeof screenToDipPoint === "function") {
		try {
			return screenToDipPoint(pointPhysical);
		} catch {
			// Fall back to scale-factor conversion below.
		}
	}

	if (pointMatchesLogicalDisplayBounds(pointPhysical, displays)) {
		return pointPhysical;
	}

	return fallbackScreenPointToDip(pointPhysical, displays);
}
