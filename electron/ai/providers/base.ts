import type {
	ResolvedAIConfig,
	SmartDemoAIAnalysisRequest,
	SmartDemoAISuggestion,
} from "../../../shared/ai";

export interface AIProvider {
	testConnection(config: ResolvedAIConfig): Promise<void>;
	analyzeSmartDemo(
		config: ResolvedAIConfig,
		request: SmartDemoAIAnalysisRequest,
	): Promise<SmartDemoAISuggestion>;
}
