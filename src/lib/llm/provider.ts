import type { Difficulty } from "@/generated/prisma/client";
import type {
  EssayGrade,
  LabScenario,
  QuizBatch,
  SubmissionGrade,
  TerminalOutput,
} from "@/lib/llm/schemas";

export class LLMOutputValidationError extends Error {
  constructor(
    public readonly feature: string,
    public readonly issues: string,
  ) {
    super(`LLM output không đúng schema cho "${feature}" sau khi retry: ${issues}`);
  }
}

export interface GenerateQuizParams {
  userId: string | null;
  topicName: string;
  topicSlug: string;
  difficulty: Difficulty;
  count: number;
  excludeStems?: string[];
}

export interface GenerateScenarioParams {
  userId: string | null;
  topicName: string;
  topicSlug: string;
  difficulty: Difficulty;
}

export interface TerminalRespondParams {
  userId: string | null;
  scenario: LabScenario;
  currentState: unknown;
  commandHistory: { command: string; output: string }[];
  command: string;
}

export interface GradeSubmissionParams {
  userId: string | null;
  scenario: LabScenario;
  rootCauseText: string;
  fixText: string;
}

export interface GradeEssayParams {
  userId: string | null;
  question: string;
  rubric: string;
  answer: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatParams {
  userId: string | null;
  systemContext: string;
  history: ChatMessage[];
  message: string;
}

export interface LLMProvider {
  generateQuizBatch(params: GenerateQuizParams): Promise<QuizBatch>;
  generateScenario(params: GenerateScenarioParams): Promise<LabScenario>;
  terminalRespond(params: TerminalRespondParams): Promise<TerminalOutput>;
  gradeSubmission(params: GradeSubmissionParams): Promise<SubmissionGrade>;
  gradeEssay(params: GradeEssayParams): Promise<EssayGrade>;
  chatStream(params: ChatParams): AsyncIterable<string>;
}

let cachedProvider: LLMProvider | undefined;

export async function getLLMProvider(): Promise<LLMProvider> {
  if (cachedProvider) return cachedProvider;

  if (process.env.LLM_PROVIDER === "mock") {
    const { MockLLMProvider } = await import("@/lib/llm/providers/mock");
    cachedProvider = new MockLLMProvider();
  } else {
    const { OpenAICompatibleProvider } = await import(
      "@/lib/llm/providers/openai-compatible"
    );
    cachedProvider = new OpenAICompatibleProvider();
  }
  return cachedProvider;
}
