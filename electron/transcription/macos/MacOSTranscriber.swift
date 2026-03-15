import AVFoundation
import Foundation
import Speech

struct TranscriptSegment: Codable {
	let id: String
	let startMs: Int
	let endMs: Int
	let text: String
	let confidence: Double?
}

struct OutputPayload: Codable {
	let segments: [TranscriptSegment]?
	let error: String?
}

enum TranscriberError: Error {
	case invalidArguments
	case unauthorized
	case recognizerUnavailable
	case missingAudioTrack
	case noTranscription
}

func emitPayloadAndExit(_ payload: OutputPayload, outputURL: URL?, code: Int32) -> Never {
	let encoder = JSONEncoder()
	encoder.outputFormatting = [.sortedKeys]
	if let data = try? encoder.encode(payload) {
		if let outputURL {
			try? data.write(to: outputURL)
		} else if let json = String(data: data, encoding: .utf8) {
			print(json)
		} else {
			print("{\"error\":\"Failed to encode output.\"}")
		}
	} else {
		print("{\"error\":\"Failed to encode output.\"}")
	}
	exit(code)
}

func requestAuthorization() async throws {
	let status = await withCheckedContinuation { continuation in
		SFSpeechRecognizer.requestAuthorization { status in
			continuation.resume(returning: status)
		}
	}

	guard status == .authorized else {
		throw TranscriberError.unauthorized
	}
}

func exportAudio(from inputURL: URL) async throws -> URL {
	let asset = AVURLAsset(url: inputURL)
	let audioTracks = try await asset.loadTracks(withMediaType: .audio)
	guard !audioTracks.isEmpty else {
		throw TranscriberError.missingAudioTrack
	}

	let outputURL = URL(fileURLWithPath: NSTemporaryDirectory())
		.appendingPathComponent(UUID().uuidString)
		.appendingPathExtension("m4a")
	try? FileManager.default.removeItem(at: outputURL)

	guard let exportSession = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
		throw TranscriberError.missingAudioTrack
	}

	exportSession.outputURL = outputURL
	exportSession.outputFileType = .m4a
	exportSession.timeRange = CMTimeRange(start: .zero, duration: try await asset.load(.duration))

	try await withCheckedThrowingContinuation { continuation in
		exportSession.exportAsynchronously {
			switch exportSession.status {
			case .completed:
				continuation.resume()
			case .failed:
				continuation.resume(throwing: exportSession.error ?? TranscriberError.missingAudioTrack)
			case .cancelled:
				continuation.resume(throwing: exportSession.error ?? TranscriberError.missingAudioTrack)
			default:
				break
			}
		}
	}

	return outputURL
}

func transcribe(audioURL: URL) async throws -> [TranscriptSegment] {
	guard let recognizer = SFSpeechRecognizer() else {
		throw TranscriberError.recognizerUnavailable
	}

	let request = SFSpeechURLRecognitionRequest(url: audioURL)
	request.shouldReportPartialResults = false
	if #available(macOS 13.0, *) {
		request.addsPunctuation = true
	}

	let result: SFSpeechRecognitionResult = try await withCheckedThrowingContinuation { continuation in
		recognizer.recognitionTask(with: request) { result, error in
			if let error {
				continuation.resume(throwing: error)
				return
			}
			if let result, result.isFinal {
				continuation.resume(returning: result)
			}
		}
	}

	let segments = result.bestTranscription.segments.map { segment in
		TranscriptSegment(
			id: "transcript-\(UUID().uuidString)",
			startMs: max(0, Int(segment.timestamp * 1000)),
			endMs: max(Int((segment.timestamp + segment.duration) * 1000), Int(segment.timestamp * 1000) + 1),
			text: segment.substring,
			confidence: Double(segment.confidence)
		)
	}

	guard !segments.isEmpty else {
		throw TranscriberError.noTranscription
	}

	return segments
}

@main
struct MacOSTranscriber {
	static func main() async {
		let arguments = CommandLine.arguments
		guard let inputIndex = arguments.firstIndex(of: "--input"), arguments.indices.contains(inputIndex + 1) else {
			emitPayloadAndExit(OutputPayload(segments: nil, error: "Missing --input path."), outputURL: nil, code: 1)
		}

		let inputURL = URL(fileURLWithPath: arguments[inputIndex + 1])
		let outputURL: URL? = {
			guard let outputIndex = arguments.firstIndex(of: "--output"), arguments.indices.contains(outputIndex + 1) else {
				return nil
			}
			return URL(fileURLWithPath: arguments[outputIndex + 1])
		}()

		do {
			try await requestAuthorization()
			let audioURL = try await exportAudio(from: inputURL)
			defer { try? FileManager.default.removeItem(at: audioURL) }
			let segments = try await transcribe(audioURL: audioURL)
			emitPayloadAndExit(OutputPayload(segments: segments, error: nil), outputURL: outputURL, code: 0)
		} catch TranscriberError.unauthorized {
			emitPayloadAndExit(
				OutputPayload(
					segments: nil,
					error: "Speech recognition permission was denied. Enable it in System Settings."
				),
				outputURL: outputURL,
				code: 1
			)
		} catch TranscriberError.missingAudioTrack {
			emitPayloadAndExit(
				OutputPayload(segments: nil, error: "The recording does not contain a readable audio track."),
				outputURL: outputURL,
				code: 1
			)
		} catch {
			emitPayloadAndExit(
				OutputPayload(segments: nil, error: String(describing: error)),
				outputURL: outputURL,
				code: 1
			)
		}
	}
}
