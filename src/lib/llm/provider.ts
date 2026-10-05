import type { Difficulty } from "@/generated/prisma/client";
import type {
  EssayGrade,
  LabScenario,
  QuizBatch,
  SkillTree,
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

/**
 * Shape tối giản, KHÔNG import trực tiếp `CurriculumArea` từ `lib/curriculum` — lớp Infra
 * (`lib/llm/`) không được phụ thuộc ngược vào Domain (`lib/curriculum`), chỉ chiều ngược lại
 * (Domain gọi Infra) mới đúng theo kiến trúc 1 chiều trong docs/ARCHITECTURE.md. Nơi gọi
 * (`lib/quiz/questionPool.ts`, `lib/lab/scenarioPool.ts`) tự import `CurriculumArea` và
 * truyền vào đây — tương thích cấu trúc (structural typing), không cần ép kiểu.
 */
export interface CurriculumAreaHint {
  title: string;
  summary: string;
}

export interface GenerateQuizParams {
  userId: string | null;
  topicName: string;
  topicSlug: string;
  difficulty: Difficulty;
  count: number;
  excludeStems?: string[];
  /** Mảng kiến thức cần bao phủ (từ curriculum chuẩn) — rỗng/undefined thì sinh tự do. */
  curriculumAreas?: CurriculumAreaHint[];
}

export interface GenerateScenarioParams {
  userId: string | null;
  topicName: string;
  topicSlug: string;
  difficulty: Difficulty;
  /** Mảng kiến thức để xoay quanh (từ curriculum chuẩn) — undefined thì sinh tự do. */
  curriculumArea?: CurriculumAreaHint;
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

export interface GenerateSkillTreeParams {
  userId: string | null;
  topicName: string;
  topicSlug: string;
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
  generateSkillTree(params: GenerateSkillTreeParams): Promise<SkillTree>;
  chatStream(params: ChatParams): AsyncIterable<string>;
}

let cachedProvider: LLMProvider | undefined;

export async function getLLMProvider(): Promise<LLMProvider> {
  if (cachedProvider) return cachedProvider;

  if (process.env.LLM_PROVIDER === "mock") {
    const [{ MockLLMProvider }, { withTracking }] = await Promise.all([
      import("@/lib/llm/providers/mock"),
      import("@/lib/llm/providers/tracked"),
    ]);
    cachedProvider = withTracking(new MockLLMProvider());
  } else {
    const { OpenAICompatibleProvider } = await import(
      "@/lib/llm/providers/openai-compatible"
    );
    cachedProvider = new OpenAICompatibleProvider();
  }
  return cachedProvider;
}
