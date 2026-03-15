import { spawn } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "build", "native");
const archTargets = [
	{ arch: "arm64", triple: "arm64-apple-macos13.0" },
	{ arch: "x86_64", triple: "x86_64-apple-macos13.0" },
];

const helperDefinitions = [
	{
		name: "MacOSTranscriber",
		sourcePath: path.join(repoRoot, "electron", "transcription", "macos", "MacOSTranscriber.swift"),
		frameworks: ["Speech", "AVFoundation"],
		plistEntries: [
			[
				"NSMicrophoneUsageDescription",
				"OpenScreen can include microphone audio in recordings and use it for narration transcription.",
			],
			[
				"NSSpeechRecognitionUsageDescription",
				"OpenScreen uses speech recognition to transcribe narration in your recordings.",
			],
		],
	},
	{
		name: "MouseClickMonitor",
		sourcePath: path.join(repoRoot, "electron", "recording", "macos", "MouseClickMonitor.swift"),
		frameworks: ["ApplicationServices"],
		plistEntries: [],
	},
	{
		name: "KeyboardShortcutMonitor",
		sourcePath: path.join(
			repoRoot,
			"electron",
			"recording",
			"macos",
			"KeyboardShortcutMonitor.swift",
		),
		frameworks: ["ApplicationServices"],
		plistEntries: [],
	},
];

function run(command, args) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, {
			stdio: "inherit",
			cwd: repoRoot,
		});
		child.on("exit", (code) => {
			if (code === 0) {
				resolve();
				return;
			}
			reject(new Error(`${command} exited with code ${code ?? "unknown"}`));
		});
		child.on("error", reject);
	});
}

function renderInfoPlist(helper) {
	const bundleSuffix = helper.name.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
	const extraEntries = helper.plistEntries
		.map(
			([key, value]) => `  <key>${key}</key>
  <string>${value}</string>`,
		)
		.join("\n");

	return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDevelopmentRegion</key>
  <string>en</string>
  <key>CFBundleExecutable</key>
  <string>${helper.name}</string>
  <key>CFBundleIdentifier</key>
  <string>com.siddharthvaddem.openscreen.${bundleSuffix}</string>
  <key>CFBundleInfoDictionaryVersion</key>
  <string>6.0</string>
  <key>CFBundleName</key>
  <string>${helper.name}</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>1.0</string>
  <key>CFBundleVersion</key>
  <string>1</string>
  <key>LSBackgroundOnly</key>
  <true/>
${extraEntries ? `${extraEntries}\n` : ""}</dict>
</plist>
`;
}

async function buildHelper(helper) {
	const universalOutputPath = path.join(outputDir, helper.name);
	const helperAppRoot = path.join(outputDir, `${helper.name}.app`);
	const helperAppExecutablePath = path.join(helperAppRoot, "Contents", "MacOS", helper.name);
	const helperAppInfoPath = path.join(helperAppRoot, "Contents", "Info.plist");

	await rm(universalOutputPath, { force: true });
	await rm(helperAppRoot, { recursive: true, force: true });

	const builtBinaries = [];
	for (const target of archTargets) {
		const outputPath = path.join(outputDir, `${helper.name}-${target.arch}`);
		await rm(outputPath, { force: true });
		try {
			const frameworkArgs = helper.frameworks.flatMap((framework) => ["-framework", framework]);
			await run("swiftc", [
				"-parse-as-library",
				helper.sourcePath,
				"-target",
				target.triple,
				...frameworkArgs,
				"-o",
				outputPath,
			]);
			builtBinaries.push(outputPath);
		} catch (error) {
			if (target.arch === process.arch) {
				throw error;
			}
			console.warn(
				`[native-helper] Skipping ${helper.name} ${target.arch} build: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	if (builtBinaries.length === 0) {
		throw new Error(`No helper binaries were built for ${helper.name}.`);
	}

	if (builtBinaries.length === 1) {
		await cp(builtBinaries[0], universalOutputPath);
	} else {
		await run("lipo", ["-create", ...builtBinaries, "-output", universalOutputPath]);
	}

	await mkdir(path.dirname(helperAppExecutablePath), { recursive: true });
	await cp(universalOutputPath, helperAppExecutablePath);
	await writeFile(helperAppInfoPath, renderInfoPlist(helper), "utf-8");
	console.log(`[native-helper] Built helper app bundle: ${helperAppRoot}`);
}

async function main() {
	if (process.platform !== "darwin") {
		console.log("[native-helper] Skipping helper build on non-macOS platform.");
		return;
	}

	await mkdir(outputDir, { recursive: true });
	for (const helper of helperDefinitions) {
		await buildHelper(helper);
	}
}

await main();
