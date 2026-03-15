import {
	type OllamaModelSummary,
	type PublicAIConfig,
	providerRequiresApiKey,
	type SaveAIConfigInput,
} from "@shared/ai";
import { RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
	getAIModelGuidance,
	getRecommendedOllamaModels,
	isInstalledOllamaModel,
} from "@/lib/ai/modelGuidance";

interface AISettingsDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	config: PublicAIConfig | null;
	onSave: (input: SaveAIConfigInput) => Promise<void>;
	onTest: () => Promise<void>;
	onClear: () => Promise<void>;
	isSaving?: boolean;
	isTesting?: boolean;
	error?: string | null;
}

const DEFAULT_MODEL = "gpt-5-mini";

export function AISettingsDialog({
	isOpen,
	onOpenChange,
	config,
	onSave,
	onTest,
	onClear,
	isSaving = false,
	isTesting = false,
	error,
}: AISettingsDialogProps) {
	const [provider, setProvider] = useState<SaveAIConfigInput["provider"]>("openai");
	const [model, setModel] = useState(DEFAULT_MODEL);
	const [apiKey, setApiKey] = useState("");
	const [baseUrl, setBaseUrl] = useState("");
	const [enabled, setEnabled] = useState(true);
	const [useVision, setUseVision] = useState(false);
	const [ollamaModels, setOllamaModels] = useState<OllamaModelSummary[]>([]);
	const [isLoadingOllamaModels, setIsLoadingOllamaModels] = useState(false);
	const [ollamaModelsError, setOllamaModelsError] = useState<string | null>(null);

	useEffect(() => {
		if (!isOpen) {
			return;
		}

		setProvider(config?.provider ?? "openai");
		setModel(config?.model ?? DEFAULT_MODEL);
		setBaseUrl(config?.baseUrl ?? "");
		setEnabled(config?.enabled ?? true);
		setUseVision(config?.useVision ?? false);
		setApiKey("");
	}, [config, isOpen]);

	const storedKeyPresent = config?.provider === provider && config.hasKey;
	const requiresApiKey = providerRequiresApiKey(provider);
	const baseUrlPlaceholder =
		provider === "ollama" ? "http://127.0.0.1:11434/api" : "https://api.openai.com/v1";
	const modelGuidance = getAIModelGuidance(provider, model, useVision);
	const recommendedOllamaModels = useMemo(
		() => getRecommendedOllamaModels(ollamaModels, useVision),
		[ollamaModels, useVision],
	);
	const currentOllamaModelInstalled = isInstalledOllamaModel(ollamaModels, model);

	const loadOllamaModels = useCallback(async () => {
		setIsLoadingOllamaModels(true);
		setOllamaModelsError(null);

		const result = await window.electronAPI.listOllamaModels({
			baseUrl: baseUrl.trim() || undefined,
			apiKey: apiKey.trim() || undefined,
		});

		if (!result.success || !result.data) {
			setOllamaModels([]);
			setOllamaModelsError(result.error ?? "Failed to load installed Ollama models.");
			setIsLoadingOllamaModels(false);
			return;
		}

		setOllamaModels(result.data);
		setIsLoadingOllamaModels(false);
	}, [apiKey, baseUrl]);

	useEffect(() => {
		if (!isOpen || provider !== "ollama") {
			return;
		}

		void loadOllamaModels();
	}, [isOpen, provider, loadOllamaModels]);

	async function handleSave() {
		await onSave({
			provider,
			model,
			apiKey,
			baseUrl: baseUrl.trim() || undefined,
			enabled,
			useVision,
		});
	}

	function handleProviderChange(newProvider: SaveAIConfigInput["provider"]) {
		setProvider(newProvider);
		if (newProvider === "ollama" && !baseUrl.trim()) {
			setBaseUrl("http://127.0.0.1:11434/api");
		} else if (newProvider === "openai" && baseUrl.trim() === "http://127.0.0.1:11434/api") {
			setBaseUrl("");
		}
	}

	return (
		<Dialog open={isOpen} onOpenChange={onOpenChange}>
			<DialogContent className="border-white/10 bg-[#101014] text-slate-100 sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>AI Settings</DialogTitle>
					<DialogDescription>
						Configure optional BYOK AI analysis. The API key is stored in the Electron main process
						only.
					</DialogDescription>
				</DialogHeader>

				<div className="grid max-h-[60vh] gap-4 overflow-y-auto pr-2 -mr-2">
					<div className="rounded-lg border border-white/10 bg-black/20 p-3">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-sm font-medium text-slate-100">Model setup</p>
								<p className="text-xs text-slate-400">
									Choose one provider and a model that follows instructions reliably.
								</p>
							</div>
							<span className="rounded-full bg-cyan-900/40 px-2 py-0.5 text-[10px] text-cyan-200">
								{provider === "ollama" ? "Local" : "Cloud"}
							</span>
						</div>

						<div className="mt-3 grid gap-2">
							<Label htmlFor="ai-provider">Provider</Label>
							<Select
								value={provider}
								onValueChange={(value) =>
									handleProviderChange(value as SaveAIConfigInput["provider"])
								}
							>
								<SelectTrigger id="ai-provider" className="border-white/10 bg-black/20">
									<SelectValue placeholder="Select provider" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="openai">OpenAI</SelectItem>
									<SelectItem value="ollama">Ollama</SelectItem>
								</SelectContent>
							</Select>
						</div>

						<div className="mt-3 grid gap-2">
							<Label htmlFor="ai-model">Model</Label>
							<Input
								id="ai-model"
								value={model}
								onChange={(event) => setModel(event.target.value)}
								placeholder={DEFAULT_MODEL}
								className="border-white/10 bg-black/20"
							/>
							<p className="text-[11px] text-slate-400">
								Use instruction-tuned models. Base models usually produce poor structured demo
								edits.
							</p>
						</div>

						{(modelGuidance.warnings.length > 0 || modelGuidance.notes.length > 0) && (
							<div className="mt-3 grid gap-2">
								{modelGuidance.warnings.map((warning) => (
									<div
										key={warning}
										className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
									>
										{warning}
									</div>
								))}
								{modelGuidance.notes.map((note) => (
									<div
										key={note}
										className="rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100"
									>
										{note}
									</div>
								))}
							</div>
						)}

						{provider === "ollama" && (
							<div className="mt-3 grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3">
								<div className="flex items-center justify-between gap-2">
									<div>
										<p className="text-xs font-medium text-slate-100">Installed Ollama models</p>
										<p className="text-[11px] text-slate-400">
											Choose a recommended installed model instead of guessing by name.
										</p>
									</div>
									<Button
										type="button"
										variant="outline"
										className="h-8 border-white/10 bg-transparent px-2 text-[11px]"
										onClick={() => void loadOllamaModels()}
										disabled={isLoadingOllamaModels}
									>
										<RefreshCw
											className={`mr-1 h-3.5 w-3.5 ${isLoadingOllamaModels ? "animate-spin" : ""}`}
										/>
										Refresh
									</Button>
								</div>

								{ollamaModelsError && (
									<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
										{ollamaModelsError}
									</div>
								)}

								{!ollamaModelsError && ollamaModels.length === 0 && !isLoadingOllamaModels && (
									<p className="text-xs text-slate-400">
										No installed Ollama models were returned from the configured endpoint.
									</p>
								)}

								{recommendedOllamaModels.length > 0 && (
									<div className="grid gap-2">
										<p className="text-[11px] font-medium text-slate-300">
											Recommended from installed models
										</p>
										<div className="flex flex-wrap gap-2">
											{recommendedOllamaModels.map((recommendedModel) => (
												<button
													key={recommendedModel.name}
													type="button"
													onClick={() => setModel(recommendedModel.name)}
													className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-500/20"
													title={recommendedModel.reason}
												>
													{recommendedModel.name}
												</button>
											))}
										</div>
										<div className="grid gap-1">
											{recommendedOllamaModels.map((recommendedModel) => (
												<p
													key={`${recommendedModel.name}-reason`}
													className="text-[11px] text-slate-400"
												>
													<span className="text-slate-200">{recommendedModel.name}</span>:{" "}
													{recommendedModel.reason}
												</p>
											))}
										</div>
									</div>
								)}

								{ollamaModels.length > 0 && (
									<div className="grid gap-2">
										<p className="text-[11px] font-medium text-slate-300">Installed models</p>
										<div className="max-h-36 overflow-y-auto rounded-lg border border-white/10">
											{ollamaModels.map((installedModel) => (
												<button
													key={installedModel.name}
													type="button"
													onClick={() => setModel(installedModel.name)}
													className="flex w-full items-center justify-between border-b border-white/5 px-3 py-2 text-left text-[11px] text-slate-300 last:border-b-0 hover:bg-white/5"
												>
													<span>{installedModel.name}</span>
													<span className="text-slate-500">
														{installedModel.parameterSize ?? installedModel.family ?? "local"}
													</span>
												</button>
											))}
										</div>
									</div>
								)}

								{ollamaModels.length > 0 && model.trim() && !currentOllamaModelInstalled && (
									<div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
										The typed model is not in the installed Ollama list returned by this endpoint.
									</div>
								)}
							</div>
						)}
					</div>

					<div className="rounded-lg border border-white/10 bg-black/20 p-3">
						<div>
							<p className="text-sm font-medium text-slate-100">Connection</p>
							<p className="text-xs text-slate-400">
								Stored only in the Electron main process. Renderer code never receives secrets.
							</p>
						</div>

						<div className="mt-3 grid gap-2">
							<Label htmlFor="ai-base-url">Base URL</Label>
							<Input
								id="ai-base-url"
								value={baseUrl}
								onChange={(event) => setBaseUrl(event.target.value)}
								placeholder={baseUrlPlaceholder}
								className="border-white/10 bg-black/20"
							/>
						</div>

						<div className="mt-3 grid gap-2">
							<Label htmlFor="ai-api-key">API Key</Label>
							<Input
								id="ai-api-key"
								type="password"
								value={apiKey}
								onChange={(event) => setApiKey(event.target.value)}
								placeholder={
									provider === "ollama"
										? "Optional for local Ollama setups"
										: storedKeyPresent
											? "Stored key present. Enter a new key to replace it."
											: "sk-..."
								}
								className="border-white/10 bg-black/20"
							/>
							{storedKeyPresent && (
								<p className="text-xs text-slate-400">
									A key is already stored. Leave this blank only if you do not want to replace it.
								</p>
							)}
							{!requiresApiKey && (
								<p className="text-xs text-slate-400">
									Ollama usually runs locally without authentication. Leave this blank unless your
									endpoint requires a bearer token.
								</p>
							)}
						</div>
					</div>

					<div className="rounded-lg border border-white/10 bg-black/20 p-3">
						<div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-3">
							<div>
								<p className="text-sm font-medium text-slate-100">Enable AI analysis</p>
								<p className="text-xs text-slate-400">
									Keep local Smart Demo usable even when cloud or local model analysis is off.
								</p>
							</div>
							<Switch checked={enabled} onCheckedChange={setEnabled} />
						</div>

						<div className="mt-3 flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-3">
							<div>
								<p className="text-sm font-medium text-slate-100">Vision mode</p>
								<p className="text-xs text-slate-400">
									Include sampled frames when the selected model actually supports image input.
								</p>
							</div>
							<Switch checked={useVision} onCheckedChange={setUseVision} />
						</div>
					</div>

					{error && (
						<div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
							{error}
						</div>
					)}
				</div>

				<DialogFooter className="gap-2 sm:justify-between">
					<div className="flex gap-2">
						<Button
							type="button"
							variant="outline"
							className="border-white/10 bg-transparent"
							onClick={() => void onClear()}
							disabled={isSaving || isTesting}
						>
							Clear
						</Button>
						<Button
							type="button"
							variant="outline"
							className="border-white/10 bg-transparent"
							onClick={() => void onTest()}
							disabled={isSaving || isTesting}
						>
							{isTesting ? "Testing..." : "Test connection"}
						</Button>
					</div>
					<Button
						type="button"
						onClick={() => void handleSave()}
						disabled={
							isSaving || !model.trim() || (requiresApiKey && !storedKeyPresent && !apiKey.trim())
						}
					>
						{isSaving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
