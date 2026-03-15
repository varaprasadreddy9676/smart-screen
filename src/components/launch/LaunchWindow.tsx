import { Mic, MicOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { FiPause, FiPlay } from "react-icons/fi";
import { BsRecordCircle } from "react-icons/bs";
import { FaRegStopCircle } from "react-icons/fa";
import { FaFolderMinus } from "react-icons/fa6";
import { FiMinus, FiX } from "react-icons/fi";
import { MdMonitor } from "react-icons/md";
import { RxDragHandleDots2 } from "react-icons/rx";
import { useScreenRecorder } from "../../hooks/useScreenRecorder";
import { Button } from "../ui/button";
import { ContentClamp } from "../ui/content-clamp";
import styles from "./LaunchWindow.module.css";

export function LaunchWindow() {
	// ── Mic state ────────────────────────────────────────────────────────────────
	const [micEnabled, setMicEnabled] = useState(true);
	const [micDeviceId, setMicDeviceId] = useState<string>("default");
	const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
	const [showMicMenu, setShowMicMenu] = useState(false);
	const micMenuRef = useRef<HTMLDivElement>(null);

	// Enumerate audio input devices
	useEffect(() => {
		const enumerateAudio = async () => {
			try {
				// Brief permission probe so labels are populated
				const devices = await navigator.mediaDevices.enumerateDevices();
				const inputs = devices.filter((d) => d.kind === "audioinput");
				setAudioDevices(inputs);
			} catch {
				// No permission yet — will retry after user grants mic
			}
		};
		enumerateAudio();
		navigator.mediaDevices.addEventListener("devicechange", enumerateAudio);
		return () => navigator.mediaDevices.removeEventListener("devicechange", enumerateAudio);
	}, []);

	// Close mic menu when clicking outside
	useEffect(() => {
		const handler = (e: MouseEvent) => {
			if (micMenuRef.current && !micMenuRef.current.contains(e.target as Node)) {
				setShowMicMenu(false);
			}
		};
		if (showMicMenu) document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [showMicMenu]);

	// ── Screen recorder ──────────────────────────────────────────────────────────
	const { recording, paused, toggleRecording, togglePauseRecording } = useScreenRecorder({
		micDeviceId: micEnabled ? micDeviceId : null,
	});

	const [recordingStart, setRecordingStart] = useState<number | null>(null);
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		let timer: NodeJS.Timeout | null = null;
		if (recording) {
			if (!recordingStart) setRecordingStart(Date.now());
			timer = setInterval(() => {
				if (recordingStart) {
					setElapsed(Math.floor((Date.now() - recordingStart) / 1000));
				}
			}, 1000);
		} else {
			setRecordingStart(null);
			setElapsed(0);
			if (timer) clearInterval(timer);
		}
		return () => {
			if (timer) clearInterval(timer);
		};
	}, [recording, recordingStart]);

	const formatTime = (seconds: number) => {
		const m = Math.floor(seconds / 60)
			.toString()
			.padStart(2, "0");
		const s = (seconds % 60).toString().padStart(2, "0");
		return `${m}:${s}`;
	};

	const [selectedSource, setSelectedSource] = useState("Screen");
	const [hasSelectedSource, setHasSelectedSource] = useState(false);

	useEffect(() => {
		const checkSelectedSource = async () => {
			if (window.electronAPI) {
				const source =
					(await window.electronAPI.getSelectedSource()) as ProcessedDesktopSource | null;
				if (source && source.name) {
					setSelectedSource(source.name);
					setHasSelectedSource(true);
				} else {
					setSelectedSource("Screen");
					setHasSelectedSource(false);
				}
			}
		};

		checkSelectedSource();

		const interval = setInterval(checkSelectedSource, 500);
		return () => clearInterval(interval);
	}, []);

	const openSourceSelector = () => {
		if (window.electronAPI) {
			window.electronAPI.openSourceSelector();
		}
	};

	const handleRecordingClick = async () => {
		if (recording) {
			toggleRecording();
			return;
		}

		if (window.electronAPI?.setSmartDemoMode) {
			await window.electronAPI.setSmartDemoMode(false);
		}

		if (hasSelectedSource) {
			toggleRecording();
		} else {
			openSourceSelector();
		}
	};

	const openVideoFile = async () => {
		if (!window.electronAPI) return;
		const result = await window.electronAPI.openVideoFilePicker();

		if (result.canceled) return;

		if (result.success && result.path) {
			await window.electronAPI.setCurrentVideoPath(result.path);
			await window.electronAPI.switchToEditor();
		}
	};

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			const isPrimaryModifier = navigator.platform.toLowerCase().includes("mac")
				? event.metaKey
				: event.ctrlKey;

			if (!isPrimaryModifier) {
				return;
			}

			if (event.key.toLowerCase() === "r") {
				event.preventDefault();
				void handleRecordingClick();
				return;
			}

			if (event.key.toLowerCase() === "p" && recording) {
				event.preventDefault();
				togglePauseRecording();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [recording, togglePauseRecording, hasSelectedSource]);

	// IPC events for hide/close
	const sendHudOverlayHide = () => {
		if (window.electronAPI && window.electronAPI.hudOverlayHide) {
			window.electronAPI.hudOverlayHide();
		}
	};
	const sendHudOverlayClose = () => {
		if (window.electronAPI && window.electronAPI.hudOverlayClose) {
			window.electronAPI.hudOverlayClose();
		}
	};

	// ── Mic toggle handler ───────────────────────────────────────────────────────
	const handleMicClick = async () => {
		if (recording) return; // don't allow changes mid-recording
		if (!micEnabled) {
			// Request permission and refresh device list
			try {
				const ms = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
				ms.getTracks().forEach((t) => t.stop());
				const devices = await navigator.mediaDevices.enumerateDevices();
				setAudioDevices(devices.filter((d) => d.kind === "audioinput"));
			} catch {
				// Permission denied — still toggle UI so user sees disabled state
			}
		}
		setMicEnabled((prev) => !prev);
		setShowMicMenu(false);
	};

	const handleMicRightClick = (e: React.MouseEvent) => {
		if (recording) return;
		e.preventDefault();
		if (audioDevices.length > 0) setShowMicMenu((prev) => !prev);
	};

	return (
		<div className="w-full h-full flex items-center bg-transparent">
			<div
				className={`w-full max-w-[660px] mx-auto flex items-center justify-between px-4 py-2 ${styles.electronDrag} ${styles.hudBar}`}
				style={{
					borderRadius: 16,
					background: "linear-gradient(135deg, rgba(28,28,36,0.97) 0%, rgba(18,18,26,0.96) 100%)",
					backdropFilter: "blur(16px) saturate(140%)",
					WebkitBackdropFilter: "blur(16px) saturate(140%)",
					border: "1px solid rgba(80,80,120,0.25)",
					minHeight: 44,
				}}
			>
				<div className={`flex items-center gap-1 ${styles.electronDrag}`}>
					<RxDragHandleDots2 size={18} className="text-white/40" />
				</div>

				{/* Source selector */}
				<Button
					variant="link"
					size="sm"
					className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-left text-xs ${styles.electronNoDrag}`}
					onClick={openSourceSelector}
					disabled={recording}
				>
					<MdMonitor size={14} className="text-white" />
					<ContentClamp truncateLength={6}>{selectedSource}</ContentClamp>
				</Button>

				<div className="w-px h-6 bg-white/30" />

				{/* Standard record button */}
				<Button
					variant="link"
					size="sm"
					onClick={() => void handleRecordingClick()}
					disabled={!hasSelectedSource && !recording}
					className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-center text-xs ${styles.electronNoDrag}`}
				>
					{recording ? (
						<>
							<FaRegStopCircle size={14} className="text-red-400" />
							<span className="text-red-400">{paused ? `Paused ${formatTime(elapsed)}` : formatTime(elapsed)}</span>
						</>
					) : (
						<>
							<BsRecordCircle
								size={14}
								className={hasSelectedSource ? "text-white" : "text-white/50"}
							/>
							<span className={hasSelectedSource ? "text-white" : "text-white/50"}>Record</span>
						</>
					)}
				</Button>

				{recording && (
					<>
						<div className="w-px h-6 bg-white/30" />
						<Button
							variant="link"
							size="sm"
							onClick={togglePauseRecording}
							className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-center text-xs ${styles.electronNoDrag}`}
						>
							{paused ? (
								<>
									<FiPlay size={14} className="text-amber-300" />
									<span className="text-amber-300">Resume</span>
								</>
							) : (
								<>
									<FiPause size={14} className="text-amber-300" />
									<span className="text-amber-300">Pause</span>
								</>
							)}
						</Button>
					</>
				)}

				<div className="w-px h-6 bg-white/30" />

				{/* Mic toggle button */}
				<div
					className={`relative flex-1 flex justify-center ${styles.electronNoDrag}`}
					ref={micMenuRef}
				>
					<Button
						variant="link"
						size="sm"
						onClick={handleMicClick}
						onContextMenu={handleMicRightClick}
						disabled={recording}
						className="gap-1 bg-transparent hover:bg-transparent px-0 text-center text-xs"
						title={
							micEnabled
								? `Mic on: ${audioDevices.find((d) => d.deviceId === micDeviceId)?.label || "Default"} — right-click to change`
								: "Mic off — click to enable microphone recording"
						}
					>
						{micEnabled ? (
							<>
								<Mic size={14} className="text-green-400" />
								<span className="text-green-400">Mic</span>
							</>
						) : (
							<>
								<MicOff size={14} className="text-white/40" />
								<span className="text-white/40">Mic</span>
							</>
						)}
					</Button>

					{/* Device picker dropdown */}
					{showMicMenu && audioDevices.length > 0 && (
						<div
							className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#1c1c24] border border-white/10 rounded-lg shadow-xl z-50 min-w-[180px] py-1"
							style={{ backdropFilter: "blur(12px)" }}
						>
							<p className="text-[10px] text-white/30 px-3 py-1 uppercase tracking-widest">
								Microphone
							</p>
							{audioDevices.map((device) => (
								<button
									key={device.deviceId}
									className={`w-full text-left text-[11px] px-3 py-1.5 hover:bg-white/10 truncate transition-colors ${
										micDeviceId === device.deviceId ? "text-green-400" : "text-white/70"
									}`}
									onClick={() => {
										setMicDeviceId(device.deviceId);
										setMicEnabled(true);
										setShowMicMenu(false);
									}}
								>
									{device.label || `Microphone ${device.deviceId.slice(0, 6)}`}
								</button>
							))}
						</div>
					)}
				</div>

				<div className="w-px h-6 bg-white/30" />

				{/* Open file */}
				<Button
					variant="link"
					size="sm"
					onClick={openVideoFile}
					className={`gap-1 text-white bg-transparent hover:bg-transparent px-0 flex-1 text-right text-xs ${styles.electronNoDrag} ${styles.folderButton}`}
					disabled={recording}
				>
					<FaFolderMinus size={14} className="text-white" />
					<span className={styles.folderText}>Open</span>
				</Button>

				{/* Separator before hide/close buttons */}
				<div className="w-px h-6 bg-white/30 mx-2" />
				<Button
					variant="link"
					size="icon"
					className={`ml-2 ${styles.electronNoDrag} hudOverlayButton`}
					title="Hide HUD"
					onClick={sendHudOverlayHide}
				>
					<FiMinus size={18} style={{ color: "#fff", opacity: 0.7 }} />
				</Button>

				<Button
					variant="link"
					size="icon"
					className={`ml-1 ${styles.electronNoDrag} hudOverlayButton`}
					title="Close App"
					onClick={sendHudOverlayClose}
				>
					<FiX size={18} style={{ color: "#fff", opacity: 0.7 }} />
				</Button>
			</div>
		</div>
	);
}
