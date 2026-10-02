import { db } from "@/lib/db";
import { applyStatePatch, matchPresetCommand, normalizeCommand } from "@/lib/lab/terminalEngine";
import { hashState } from "@/lib/lab/stateHash";
import type { SessionState } from "@/lib/lab/sessionState";
import { getLLMProvider } from "@/lib/llm/provider";
import { TerminalOutputSchema, type LabScenario } from "@/lib/llm/schemas";

export interface RunCommandParams {
  scenario: LabScenario;
  scenarioId: string;
  state: SessionState;
  commandHistory: { command: string; output: string }[];
  rawCommand: string;
  userId: string | null;
}

export interface RunCommandResult {
  output: string;
  newState: SessionState;
  source: "PRESET" | "LLM";
}

export async function resolveCommand(params: RunCommandParams): Promise<RunCommandResult> {
  const preset = matchPresetCommand(params.scenario, params.rawCommand);
  if (preset) {
    const newState = preset.stateEffect
      ? applyStatePatch(params.state, preset.stateEffect.patch)
      : params.state;
    return { output: preset.output, newState, source: "PRESET" };
  }

  const stateHash = hashState(params.state);
  const commandNorm = normalizeCommand(params.rawCommand);

  const cached = await db.labLlmCommandCache.findUnique({
    where: {
      scenarioId_stateHash_commandNorm: { scenarioId: params.scenarioId, stateHash, commandNorm },
    },
  });

  if (cached) {
    const parsed = TerminalOutputSchema.parse(JSON.parse(cached.output));
    const newState = parsed.stateEffect ? applyStatePatch(params.state, parsed.stateEffect.patch) : params.state;
    return { output: parsed.output, newState, source: "LLM" };
  }

  const provider = await getLLMProvider();
  const result = await provider.terminalRespond({
    userId: params.userId,
    scenario: params.scenario,
    currentState: params.state,
    commandHistory: params.commandHistory,
    command: params.rawCommand,
  });

  await db.labLlmCommandCache
    .create({
      data: {
        scenarioId: params.scenarioId,
        stateHash,
        commandNorm,
        output: JSON.stringify(result),
      },
    })
    // Hai request trùng (scenarioId, stateHash, commandNorm) chạy gần như đồng thời đều có thể
    // tới đây — cái sau vi phạm unique constraint, bỏ qua vì cache đã có sẵn giá trị tương đương.
    .catch(() => {});

  const newState = result.stateEffect ? applyStatePatch(params.state, result.stateEffect.patch) : params.state;
  return { output: result.output, newState, source: "LLM" };
}
