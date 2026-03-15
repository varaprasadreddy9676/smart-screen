import type { TranscriptSanityWarning, TranscriptSegment } from "@shared/ai";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { parseTranscriptTimestamp } from "@/lib/ai/transcriptFormats";

interface TranscriptReviewDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	segments: TranscriptSegment[];
	warnings: TranscriptSanityWarning[];
	sourceLabel: string | null;
	onSave: (segments: TranscriptSegment[]) => void;
}

interface EditableTranscriptSegment {
	id: string;
	start: string;
	end: string;
	text: string;
	speaker: string;
}

function formatTimestampForEdit(timestampMs: number) {
	const totalSeconds = Math.floor(timestampMs / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	const milliseconds = timestampMs % 1000;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function toEditableSegment(segment: TranscriptSegment): EditableTranscriptSegment {
	return {
		id: segment.id,
		start: formatTimestampForEdit(segment.startMs),
		end: formatTimestampForEdit(segment.endMs),
		text: segment.text,
		speaker: segment.speaker ?? "",
	};
}

export function TranscriptReviewDialog({
	isOpen,
	onOpenChange,
	segments,
	warnings,
	sourceLabel,
	onSave,
}: TranscriptReviewDialogProps) {
	const [draftSegments, setDraftSegments] = useState<EditableTranscriptSegment[]>([]);
	const [validationError, setValidationError] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			return;
		}
		setDraftSegments(segments.map((segment) => toEditableSegment(segment)));
		setValidationError(null);
	}, [isOpen, segments]);

	const segmentSummary = useMemo(
		() => `${segments.length} segment${segments.length !== 1 ? "s" : ""}`,
		[segments.length],
	);

	function updateDraftSegment(id: string, key: keyof EditableTranscriptSegment, value: string) {
		setDraftSegments((current) =>
			current.map((segment) => (segment.id === id ? { ...segment, [key]: value } : segment)),
		);
	}

	function removeDraftSegment(id: string) {
		setDraftSegments((current) => current.filter((segment) => segment.id !== id));
	}

	function handleSave() {
		try {
			const normalizedSegments = draftSegments.map((segment, index) => {
				const startMs = parseTranscriptTimestamp(segment.start);
				const endMs = parseTranscriptTimestamp(segment.end);
				if (startMs === null || endMs === null) {
					throw new Error(`Segment ${index + 1} has an invalid timestamp.`);
				}
				if (!segment.text.trim()) {
					throw new Error(`Segment ${index + 1} is missing transcript text.`);
				}
				return {
					id: segment.id,
					startMs,
					endMs: Math.max(startMs + 1, endMs),
					text: segment.text.trim(),
					speaker: segment.speaker.trim() || undefined,
				};
			});

			onSave(normalizedSegments.sort((a, b) => a.startMs - b.startMs));
			onOpenChange(false);
		} catch (error) {
			setValidationError(error instanceof Error ? error.message : String(error));
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="border-white/10 bg-[#101014] text-slate-100 sm:max-w-4xl">
				<DialogHeader>
					<DialogTitle>Review Transcript</DialogTitle>
					<DialogDescription>
						Edit timestamps and text before applying AI suggestions.{" "}
						{sourceLabel ? `Source: ${sourceLabel}.` : ""}
					</DialogDescription>
				</DialogHeader>

				<div className="grid max-h-[70vh] gap-4 overflow-y-auto pr-2">
					<div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
						<span>{segmentSummary}</span>
						{warnings.length > 0 && (
							<span className="text-amber-200">
								{warnings.length} mismatch warning{warnings.length !== 1 ? "s" : ""}
							</span>
						)}
					</div>

					{warnings.length > 0 && (
						<div className="grid gap-2">
							{warnings.map((warning) => (
								<div
									key={warning.id}
									className={`rounded-lg px-3 py-2 text-xs ${
										warning.severity === "error"
											? "border border-red-500/30 bg-red-500/10 text-red-200"
											: "border border-amber-500/30 bg-amber-500/10 text-amber-200"
									}`}
								>
									{warning.message}
								</div>
							))}
						</div>
					)}

					<div className="grid gap-3">
						{draftSegments.map((segment, index) => (
							<div key={segment.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
								<div className="mb-2 flex items-center justify-between gap-2">
									<span className="text-xs font-medium text-slate-200">Segment {index + 1}</span>
									<Button
										type="button"
										variant="ghost"
										className="h-7 px-2 text-xs text-red-300 hover:text-red-200"
										onClick={() => removeDraftSegment(segment.id)}
									>
										Remove
									</Button>
								</div>

								<div className="grid gap-3 sm:grid-cols-3">
									<div className="grid gap-1">
										<label className="text-[11px] text-slate-400" htmlFor={`${segment.id}-start`}>
											Start
										</label>
										<Input
											id={`${segment.id}-start`}
											value={segment.start}
											onChange={(event) =>
												updateDraftSegment(segment.id, "start", event.target.value)
											}
											className="border-white/10 bg-black/20"
										/>
									</div>
									<div className="grid gap-1">
										<label className="text-[11px] text-slate-400" htmlFor={`${segment.id}-end`}>
											End
										</label>
										<Input
											id={`${segment.id}-end`}
											value={segment.end}
											onChange={(event) =>
												updateDraftSegment(segment.id, "end", event.target.value)
											}
											className="border-white/10 bg-black/20"
										/>
									</div>
									<div className="grid gap-1">
										<label className="text-[11px] text-slate-400" htmlFor={`${segment.id}-speaker`}>
											Speaker
										</label>
										<Input
											id={`${segment.id}-speaker`}
											value={segment.speaker}
											onChange={(event) =>
												updateDraftSegment(segment.id, "speaker", event.target.value)
											}
											className="border-white/10 bg-black/20"
											placeholder="Optional"
										/>
									</div>
								</div>

								<div className="mt-3 grid gap-1">
									<label className="text-[11px] text-slate-400" htmlFor={`${segment.id}-text`}>
										Text
									</label>
									<textarea
										id={`${segment.id}-text`}
										value={segment.text}
										onChange={(event) => updateDraftSegment(segment.id, "text", event.target.value)}
										className="min-h-[72px] rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500/40"
									/>
								</div>
							</div>
						))}
					</div>

					{validationError && (
						<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
							{validationError}
						</div>
					)}
				</div>

				<DialogFooter className="gap-2 sm:justify-between">
					<div className="text-xs text-slate-400">
						Use `mm:ss.mmm` or `hh:mm:ss.mmm` timestamps.
					</div>
					<Button type="button" onClick={handleSave} disabled={draftSegments.length === 0}>
						Save Transcript Edits
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
