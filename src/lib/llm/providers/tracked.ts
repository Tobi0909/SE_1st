import { db } from "@/lib/db";
import type {
  ChatParams,
  GenerateQuizParams,
  GenerateScenarioParams,
  GenerateSkillTreeParams,
  GradeEssayParams,
  GradeSubmissionParams,
  LLMProvider,
  TerminalRespondParams,
} from "@/lib/llm/provider";
import { assertWithinRateLimit } from "@/lib/llm/rateLimiter";

/**
 * Bọc 1 LLMProvider bất kỳ (kể cả MockLLMProvider) với rate limit + ghi `LlmUsageLog` —
 * MockLLMProvider không tự làm việc này (không có request HTTP thật để lấy usage/latency
 * thật), nhưng vẫn cần đi qua rate limit + xuất hiện trong thống kê `/admin/usage` khi team
 * dùng `LLM_PROVIDER=mock` để test/demo. `OpenAICompatibleProvider` tự ghi log chi tiết hơn
 * (có promptTokens/completionTokens thật) nên KHÔNG bọc thêm ở đây để tránh ghi trùng.
 */
export function withTracking(provider: LLMProvider): LLMProvider {
  const model = process.env.LLM_MODEL ?? "unknown";

  async function tracked<T>(feature: string, userId: string | null, fn: () => Promise<T>): Promise<T> {
    await assertWithinRateLimit(userId);
    const startedAt = Date.now();
    let success = false;
    let errorMessage: string | undefined;
    try {
      const result = await fn();
      success = true;
      return result;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      await db.llmUsageLog.create({
        data: {
          userId,
          feature,
          model,
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: Date.now() - startedAt,
          success,
          errorMessage,
        },
      });
    }
  }

  async function* trackedStream(userId: string | null, gen: AsyncIterable<string>): AsyncIterable<string> {
    await assertWithinRateLimit(userId);
    const startedAt = Date.now();
    let success = false;
    let errorMessage: string | undefined;
    try {
      for await (const chunk of gen) {
        yield chunk;
      }
      success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      await db.llmUsageLog.create({
        data: {
          userId,
          feature: "tutor.chat",
          model,
          promptTokens: 0,
          completionTokens: 0,
          latencyMs: Date.now() - startedAt,
          success,
          errorMessage,
        },
      });
    }
  }

  return {
    generateQuizBatch: (params: GenerateQuizParams) =>
      tracked("quiz.generate", params.userId, () => provider.generateQuizBatch(params)),
    generateScenario: (params: GenerateScenarioParams) =>
      tracked("lab.scenario-generate", params.userId, () => provider.generateScenario(params)),
    terminalRespond: (params: TerminalRespondParams) =>
      tracked("lab.terminal-respond", params.userId, () => provider.terminalRespond(params)),
    gradeSubmission: (params: GradeSubmissionParams) =>
      tracked("lab.grade-submission", params.userId, () => provider.gradeSubmission(params)),
    gradeEssay: (params: GradeEssayParams) =>
      tracked("tutor.grade-essay", params.userId, () => provider.gradeEssay(params)),
    generateSkillTree: (params: GenerateSkillTreeParams) =>
      tracked("roadmap.generate-tree", params.userId, () => provider.generateSkillTree(params)),
    chatStream: (params: ChatParams) => trackedStream(params.userId, provider.chatStream(params)),
  };
}
