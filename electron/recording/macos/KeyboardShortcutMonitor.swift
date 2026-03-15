import ApplicationServices
import Darwin
import Foundation

struct KeyEventPayload: Codable {
	let type: String
	let timestampMs: Int
	let text: String
	let coalescible: Bool
}

struct ErrorPayload: Codable {
	let type: String
	let error: String
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

func queryAccessibilityTrust(prompt: Bool) -> Bool {
	let promptKey = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
	let options = [promptKey: prompt] as CFDictionary
	return AXIsProcessTrustedWithOptions(options)
}

func requestAccessibilityTrust() -> Bool {
	queryAccessibilityTrust(prompt: true)
}

func modifierLabels(for flags: CGEventFlags) -> [String] {
	var labels: [String] = []
	if flags.contains(.maskCommand) {
		labels.append("Cmd")
	}
	if flags.contains(.maskControl) {
		labels.append("Ctrl")
	}
	if flags.contains(.maskAlternate) {
		labels.append("Option")
	}
	if flags.contains(.maskShift) {
		labels.append("Shift")
	}
	return labels
}

let printableCharacters: [Int64: (plain: String, shifted: String)] = [
	0: ("a", "A"),
	1: ("s", "S"),
	2: ("d", "D"),
	3: ("f", "F"),
	4: ("h", "H"),
	5: ("g", "G"),
	6: ("z", "Z"),
	7: ("x", "X"),
	8: ("c", "C"),
	9: ("v", "V"),
	11: ("b", "B"),
	12: ("q", "Q"),
	13: ("w", "W"),
	14: ("e", "E"),
	15: ("r", "R"),
	16: ("y", "Y"),
	17: ("t", "T"),
	18: ("1", "!"),
	19: ("2", "@"),
	20: ("3", "#"),
	21: ("4", "$"),
	22: ("6", "^"),
	23: ("5", "%"),
	24: ("=", "+"),
	25: ("9", "("),
	26: ("7", "&"),
	27: ("-", "_"),
	28: ("8", "*"),
	29: ("0", ")"),
	30: ("]", "}"),
	31: ("o", "O"),
	32: ("u", "U"),
	33: ("[", "{"),
	34: ("i", "I"),
	35: ("p", "P"),
	37: ("l", "L"),
	38: ("j", "J"),
	39: ("'", "\""),
	40: ("k", "K"),
	41: (";", ":"),
	42: ("\\", "|"),
	43: (",", "<"),
	44: ("/", "?"),
	45: ("n", "N"),
	46: ("m", "M"),
	47: (".", ">"),
	50: ("`", "~"),
]

let specialKeyLabels: [Int64: String] = [
	36: "Enter",
	48: "Tab",
	49: "Space",
	51: "Backspace",
	53: "Escape",
	71: "Clear",
	76: "Enter",
	96: "F5",
	97: "F6",
	98: "F7",
	99: "F3",
	100: "F8",
	101: "F9",
	103: "F11",
	105: "F13",
	106: "F16",
	107: "F14",
	109: "F10",
	111: "F12",
	113: "F15",
	114: "Help",
	115: "Home",
	116: "Page Up",
	117: "Delete",
	118: "F4",
	119: "End",
	120: "F2",
	121: "Page Down",
	122: "F1",
	123: "Arrow Left",
	124: "Arrow Right",
	125: "Arrow Down",
	126: "Arrow Up",
]

func describeKeyEvent(_ event: CGEvent) -> (text: String, coalescible: Bool)? {
	let keyCode = event.getIntegerValueField(.keyboardEventKeycode)
	let flags = event.flags

	if event.getIntegerValueField(.keyboardEventAutorepeat) == 1 {
		return nil
	}

	let hasCommandLikeModifier = flags.contains(.maskCommand) || flags.contains(.maskControl) || flags.contains(.maskAlternate)
	let modifierPrefix = modifierLabels(for: flags)

	if let printable = printableCharacters[keyCode] {
		let shifted = flags.contains(.maskShift) || flags.contains(.maskAlphaShift)
		let character = shifted ? printable.shifted : printable.plain
		if hasCommandLikeModifier {
			return (text: (modifierPrefix + [character.uppercased()]).joined(separator: "+"), coalescible: false)
		}
		return (text: character, coalescible: true)
	}

	guard let label = specialKeyLabels[keyCode] else {
		return nil
	}

	if modifierPrefix.isEmpty {
		return (text: label, coalescible: false)
	}

	return (text: (modifierPrefix + [label]).joined(separator: "+"), coalescible: false)
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
struct KeyboardShortcutMonitor {
	static func main() {
		guard requestAccessibilityTrust() else {
			emitJSON(
				ErrorPayload(
					type: "error",
					error: "Accessibility permission was denied. Enable Smart Screen in System Settings > Privacy & Security > Accessibility."
				)
			)
			exit(1)
		}

		signal(SIGTERM, shutdown)
		signal(SIGINT, shutdown)

		let eventMask = 1 << CGEventType.keyDown.rawValue

		let callback: CGEventTapCallBack = { _, type, event, _ in
			if type == .tapDisabledByTimeout || type == .tapDisabledByUserInput {
				if let eventTap {
					CGEvent.tapEnable(tap: eventTap, enable: true)
				}
				return Unmanaged.passUnretained(event)
			}

			if let description = describeKeyEvent(event) {
				emitJSON(
					KeyEventPayload(
						type: "key",
						timestampMs: Int(Date().timeIntervalSince1970 * 1000),
						text: description.text,
						coalescible: description.coalescible
					)
				)
			}
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
			emitJSON(ErrorPayload(type: "error", error: "Failed to create the macOS event tap for global keyboard events."))
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
