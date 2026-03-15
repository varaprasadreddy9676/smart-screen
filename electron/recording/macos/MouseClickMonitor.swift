import ApplicationServices
import Darwin
import Foundation

struct MouseEventPayload: Codable {
	let type: String
	let timestampMs: Int
	let x: Double
	let y: Double
	let button: String
	let phase: String
}

struct ErrorPayload: Codable {
	let type: String
	let error: String
}

struct StatusPayload: Codable {
	let type: String
	let trusted: Bool
	let prompted: Bool
}

func emitJSON<T: Encodable>(_ payload: T) {
	let encoder = JSONEncoder()
	encoder.outputFormatting = [.sortedKeys]
	guard
		let data = try? encoder.encode(payload),
		var json = String(data: data, encoding: .utf8)
	else {
		return
	}

	json.append("\n")
	fputs(json, stdout)
	fflush(stdout)
}

func buttonName(for eventType: CGEventType) -> String {
	switch eventType {
	case .leftMouseDown, .leftMouseUp:
		return "left"
	case .rightMouseDown, .rightMouseUp:
		return "right"
	case .otherMouseDown, .otherMouseUp:
		return "other"
	default:
		return "other"
	}
}

func phaseName(for eventType: CGEventType) -> String {
	switch eventType {
	case .leftMouseDown, .rightMouseDown, .otherMouseDown:
		return "down"
	default:
		return "up"
	}
}

func queryAccessibilityTrust(prompt: Bool) -> Bool {
	let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
	let options = [promptKey: prompt] as CFDictionary
	return AXIsProcessTrustedWithOptions(options)
}

func requestAccessibilityTrust() -> Bool {
	queryAccessibilityTrust(prompt: true)
}

var eventTap: CFMachPort?
var runLoopSource: CFRunLoopSource?

func shutdown(_ signal: Int32) -> Void {
	if let eventTap {
		CFMachPortInvalidate(eventTap)
	}
	if let runLoopSource {
		CFRunLoopRemoveSource(CFRunLoopGetMain(), runLoopSource, .commonModes)
	}
	exit(128 + signal)
}

@main
struct MouseClickMonitor {
	static func main() {
		if CommandLine.arguments.contains("--check-accessibility") {
			emitJSON(StatusPayload(type: "status", trusted: queryAccessibilityTrust(prompt: false), prompted: false))
			exit(0)
		}

		if CommandLine.arguments.contains("--prompt-accessibility") {
			emitJSON(StatusPayload(type: "status", trusted: queryAccessibilityTrust(prompt: true), prompted: true))
			exit(0)
		}

		guard requestAccessibilityTrust() else {
			emitJSON(ErrorPayload(type: "error", error: "Accessibility permission was denied. Enable OpenScreen Smart Demo in System Settings > Privacy & Security > Accessibility."))
			exit(1)
		}

		signal(SIGTERM, shutdown)
		signal(SIGINT, shutdown)

		let eventMask =
			(1 << CGEventType.leftMouseDown.rawValue) |
			(1 << CGEventType.leftMouseUp.rawValue) |
			(1 << CGEventType.rightMouseDown.rawValue) |
			(1 << CGEventType.rightMouseUp.rawValue) |
			(1 << CGEventType.otherMouseDown.rawValue) |
			(1 << CGEventType.otherMouseUp.rawValue)

		let callback: CGEventTapCallBack = { _, type, event, _ in
			if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
				if let eventTap {
					CGEvent.tapEnable(tap: eventTap, enable: true)
				}
				return Unmanaged.passUnretained(event)
			}

			let location = event.location
			let payload = MouseEventPayload(
				type: "mouse",
				timestampMs: Int(Date().timeIntervalSince1970 * 1000),
				x: location.x,
				y: location.y,
				button: buttonName(for: type),
				phase: phaseName(for: type)
			)
			emitJSON(payload)
			return Unmanaged.passUnretained(event)
		}

		guard let tap = CGEvent.tapCreate(
			tap: .cgSessionEventTap,
			place: .headInsertEventTap,
			options: .listenOnly,
			eventsOfInterest: CGEventMask(eventMask),
			callback: callback,
			userInfo: nil
		) else {
			emitJSON(ErrorPayload(type: "error", error: "Failed to create the macOS event tap for global mouse events."))
			exit(1)
		}

		eventTap = tap
		let source = CFMachPortCreateRunLoopSource(kCFAllocatorDefault, tap, 0)
		runLoopSource = source
		CFRunLoopAddSource(CFRunLoopGetMain(), source, .commonModes)
		CGEvent.tapEnable(tap: tap, enable: true)
		CFRunLoopRun()
	}
}
