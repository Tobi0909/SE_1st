import { describe, expect, it } from "vitest";

import { MockLLMProvider } from "@/lib/llm/providers/mock";
import { LabScenarioSchema, QuizBatchSchema, TerminalOutputSchema } from "@/lib/llm/schemas";

const provider = new MockLLMProvider();

describe("MockLLMProvider", () => {
  it("generateQuizBatch trả dữ liệu đúng schema", async () => {
    const batch = await provider.generateQuizBatch({
      userId: null,
      topicName: "Linux",
      topicSlug: "linux",
      difficulty: "EASY",
      count: 3,
    });
    expect(batch.questions).toHaveLength(3);
    expect(QuizBatchSchema.safeParse(batch).success).toBe(true);
  });

  it("generateScenario trả dữ liệu đúng schema", async () => {
    const scenario = await provider.generateScenario({
      userId: null,
      topicName: "Linux",
      topicSlug: "linux",
      difficulty: "MEDIUM",
    });
    expect(LabScenarioSchema.safeParse(scenario).success).toBe(true);
  });

  it("terminalRespond trả dữ liệu đúng schema", async () => {
    const scenario = await provider.generateScenario({
      userId: null,
      topicName: "Linux",
      topicSlug: "linux",
      difficulty: "MEDIUM",
    });
    const output = await provider.terminalRespond({
      userId: null,
      scenario,
      currentState: {},
      commandHistory: [],
      command: "ls -la",
    });
    expect(TerminalOutputSchema.safeParse(output).success).toBe(true);
  });

  it("chatStream trả về các đoạn text", async () => {
    const chunks: string[] = [];
    for await (const chunk of provider.chatStream({
      userId: null,
      systemContext: "",
      history: [],
      message: "xin chào",
    })) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toContain("xin chào");
  });
});
