import type { Difficulty } from "@/generated/prisma/client";
import type { LabScenario } from "@/lib/llm/schemas";

/** Input gọn cho 1 lab mẫu viết tay — `scenario()` điền version=1 và ráp đúng shape LabScenario. */
export interface ScenarioInput {
  topicSlug: string;
  difficulty: Difficulty;
  title: string;
  context: string;
  symptoms: [string, ...string[]];
  filesystem: LabScenario["hiddenState"]["filesystem"];
  services: LabScenario["hiddenState"]["services"];
  logs: Record<string, string[]>;
  rootCauseSummary: string;
  rootCauseExplanation: string;
  requiredFindings: [string, ...string[]];
  rubric: [{ criterion: string; weight: number }, ...{ criterion: string; weight: number }[]];
  presetCommands: LabScenario["presetCommands"];
  hints: [string, string, string];
}

export function scenario(input: ScenarioInput): LabScenario {
  return {
    version: 1,
    title: input.title,
    topicSlug: input.topicSlug,
    difficulty: input.difficulty,
    briefing: { context: input.context, symptoms: input.symptoms },
    hiddenState: {
      filesystem: input.filesystem,
      services: input.services,
      logs: input.logs,
    },
    rootCause: { summary: input.rootCauseSummary, explanation: input.rootCauseExplanation },
    completionCriteria: { requiredFindings: input.requiredFindings, rubric: input.rubric },
    presetCommands: input.presetCommands,
    hints: input.hints,
  };
}
