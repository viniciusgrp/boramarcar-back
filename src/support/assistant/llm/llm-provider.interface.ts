export interface LlmChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionRequest {
  systemInstruction: string;
  userTurn: string;
  history: LlmChatMessage[];
}

export interface LlmCompletionResult {
  content: string;
  provider: string;
  model: string;
  tokenUsage: Record<string, unknown> | null;
}

export interface LlmProvider {
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResult>;
}
