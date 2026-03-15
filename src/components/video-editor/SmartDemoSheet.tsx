import { X } from "lucide-react";
import type { ReactNode } from "react";

interface SmartDemoSheetProps {
	open: boolean;
	onClose: () => void;
	children: ReactNode;
}

export function SmartDemoSheet({ open, onClose, children }: SmartDemoSheetProps) {
	return (
		<>
			{/* Backdrop */}
			{open && (
				<div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />
			)}

			{/* Slide-over panel */}
			<div
				className={`fixed right-0 top-0 z-50 flex h-full w-[340px] flex-col bg-[#0f0f12] border-l border-white/8 shadow-2xl transition-transform duration-300 ease-in-out ${
					open ? "translate-x-0" : "translate-x-full"
				}`}
			>
				{/* Header */}
				<div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
					<div className="flex items-center gap-2">
						<svg
							className="h-4 w-4 text-purple-400"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
							strokeWidth={2}
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								d="M9.663 17h4.673M12 3v1m6.364 1.636-.707.707M21 12h-1M4 12H3m3.343-5.657-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
							/>
						</svg>
						<span className="text-sm font-semibold text-white">Smart Demo</span>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/8 hover:text-white"
						aria-label="Close"
					>
						<X className="h-4 w-4" />
					</button>
				</div>

				{/* Scrollable content */}
				<div className="flex-1 overflow-y-auto px-4 py-3">{children}</div>
			</div>
		</>
	);
}
