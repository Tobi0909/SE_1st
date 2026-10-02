import { db } from "@/lib/db";
import { LLMOutputValidationError } from "@/lib/llm/provider";
import type {
  ChatParams,
  GenerateQuizParams,
  GenerateScenarioParams,
  GradeEssayParams,
  GradeSubmissionParams,
  LLMProvider,
  TerminalRespondParams,
} from "@/lib/llm/provider";
import { assertWithinRateLimit } from "@/lib/llm/rateLimiter";
import {
  EssayGradeSchema,
  LabScenarioSchema,
  QuizBatchSchema,
  SubmissionGradeSchema,
  TerminalOutputSchema,
  type EssayGrade,
  type LabScenario,
  type QuizBatch,
  type SubmissionGrade,
  type TerminalOutput,
} from "@/lib/llm/schemas";
import * as quizGenerate from "@prompts/quiz/generate.v1";
import * as scenarioGenerate from "@prompts/lab/scenario-generate.v1";
import * as terminalOutput from "@prompts/lab/terminal-output.v1";
import * as gradeSubmission from "@prompts/lab/grade-submission.v1";
import * as chatPrompt from "@prompts/tutor/chat.v1";
import * as gradeEssay from "@prompts/tutor/grade-essay.v1";

import type { z } from "zod";

const MAX_ATTEMPTS = 3; // 1 lần gọi gốc + tối đa 2 lần retry

interface ChatCompletionResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export class OpenAICompatibleProvider implements LLMProvider {
  private get baseUrl() {
    const url = process.env.LLM_BASE_URL;
    if (!url) throw new Error("LLM_BASE_URL chưa được cấu hình");
    return url.replace(/\/$/, "");
  }

  private get apiKey() {
    const key = process.env.LLM_API_KEY;
    if (!key) throw new Error("LLM_API_KEY chưa được cấu hình");
    return key;
  }

  private get model() {
    const model = process.env.LLM_MODEL;
    if (!model) throw new Error("LLM_MODEL chưa được cấu hình");
    return model;
  }

  private async callJson<T>(
    feature: string,
    userId: string | null,
    schema: z.ZodType<T>,
    systemPrompt: string,
    userPrompt: string,
  ): Promise<T> {
    await assertWithinRateLimit(userId);

    let lastIssues = "";
    let correctionPrompt = userPrompt;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const startedAt = Date.now();
      let success = false;
      let errorMessage: string | undefined;
      let promptTokens = 0;
      let completionTokens = 0;

      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: correctionPrompt },
            ],
          }),
        });

        if (!res.ok) {
          throw new Error(`LLM API trả lỗi HTTP ${res.status}: ${await res.text()}`);
        }

        const body = (await res.json()) as ChatCompletionResponse;
        promptTokens = body.usage?.prompt_tokens ?? 0;
        completionTokens = body.usage?.completion_tokens ?? 0;

        const raw = body.choices[0]?.message.content ?? "";
        const json = JSON.parse(stripCodeFence(raw));
        const parsed = schema.safeParse(json);

        if (!parsed.success) {
          lastIssues = parsed.error.message;
          correctionPrompt = `${userPrompt}\n\nLần trả lời trước KHÔNG đúng schema, lỗi: ${lastIssues}\nHãy trả lại đúng JSON theo schema, sửa các lỗi trên.`;
          throw new Error(`Output không đúng schema: ${lastIssues}`);
        }

        success = true;
        return parsed.data;
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : String(err);
        if (attempt === MAX_ATTEMPTS) {
          throw new LLMOutputValidationError(feature, errorMessage);
        }
      } finally {
        await db.llmUsageLog.create({
          data: {
            userId,
            feature,
            model: this.model,
            promptTokens,
            completionTokens,
            latencyMs: Date.now() - startedAt,
            success,
            errorMessage,
          },
        });
      }
    }

    // Không thể đạt tới đây vì vòng lặp trên luôn return hoặc throw ở lần cuối.
    throw new LLMOutputValidationError(feature, lastIssues);
  }

  async generateQuizBatch(params: GenerateQuizParams): Promise<QuizBatch> {
    const userPrompt = quizGenerate.buildUserPrompt({
      topicName: params.topicName,
      difficulty: params.difficulty,
      count: params.count,
      excludeStems: params.excludeStems,
    });
    return this.callJson(
      "quiz.generate",
      params.userId,
      QuizBatchSchema,
      quizGenerate.systemPrompt,
      userPrompt,
    );
  }

  async generateScenario(params: GenerateScenarioParams): Promise<LabScenario> {
    const userPrompt = scenarioGenerate.buildUserPrompt({
      topicName: params.topicName,
      topicSlug: params.topicSlug,
      difficulty: params.difficulty,
    });
    return this.callJson(
      "lab.scenario-generate",
      params.userId,
      LabScenarioSchema,
      scenarioGenerate.systemPrompt,
      userPrompt,
    );
  }

  async terminalRespond(params: TerminalRespondParams): Promise<TerminalOutput> {
    const userPrompt = terminalOutput.buildUserPrompt({
      scenarioBriefing: `${params.scenario.briefing.context}\nTriệu chứng: ${params.scenario.briefing.symptoms.join(", ")}`,
      hiddenStateJson: JSON.stringify({
        hiddenState: params.scenario.hiddenState,
        rootCause: params.scenario.rootCause,
      }),
      currentStateJson: JSON.stringify(params.currentState),
      commandHistory: params.commandHistory,
      command: params.command,
    });
    return this.callJson(
      "lab.terminal-respond",
      params.userId,
      TerminalOutputSchema,
      terminalOutput.systemPrompt,
      userPrompt,
    );
  }

  async gradeSubmission(params: GradeSubmissionParams): Promise<SubmissionGrade> {
    const userPrompt = gradeSubmission.buildUserPrompt({
      rootCauseSummary: params.scenario.rootCause.summary,
      rootCauseExplanation: params.scenario.rootCause.explanation,
      requiredFindings: params.scenario.completionCriteria.requiredFindings,
      rubric: params.scenario.completionCriteria.rubric,
      rootCauseText: params.rootCauseText,
      fixText: params.fixText,
    });
    return this.callJson(
      "lab.grade-submission",
      params.userId,
      SubmissionGradeSchema,
      gradeSubmission.systemPrompt,
      userPrompt,
    );
  }

  async gradeEssay(params: GradeEssayParams): Promise<EssayGrade> {
    const userPrompt = gradeEssay.buildUserPrompt({
      question: params.question,
      rubric: params.rubric,
      answer: params.answer,
    });
    return this.callJson(
      "tutor.grade-essay",
      params.userId,
      EssayGradeSchema,
      gradeEssay.systemPrompt,
      userPrompt,
    );
  }

  async *chatStream(params: ChatParams): AsyncIterable<string> {
    await assertWithinRateLimit(params.userId);

    const startedAt = Date.now();
    let success = false;
    let errorMessage: string | undefined;
    let promptTokens = 0;
    let completionTokens = 0;

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          stream: true,
          messages: [
            { role: "system", content: chatPrompt.systemPrompt },
            { role: "system", content: chatPrompt.buildContextPrompt({ contextDescription: params.systemContext }) },
            ...params.history.map((m) => ({ role: m.role, content: m.content })),
            { role: "user", content: params.message },
          ],
        }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`LLM API trả lỗi HTTP ${res.status}: ${await res.text()}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") continue;

          const chunk = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens: number; completion_tokens: number };
          };
          if (chunk.usage) {
            promptTokens = chunk.usage.prompt_tokens;
            completionTokens = chunk.usage.completion_tokens;
          }
          const content = chunk.choices?.[0]?.delta?.content;
          if (content) yield content;
        }
      }

      success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      await db.llmUsageLog.create({
        data: {
          userId: params.userId,
          feature: "tutor.chat",
          model: this.model,
          promptTokens,
          completionTokens,
          latencyMs: Date.now() - startedAt,
          success,
          errorMessage,
        },
      });
    }
  }
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return match ? match[1] : trimmed;
}
