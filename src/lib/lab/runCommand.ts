import { applyStatePatch, matchPresetCommand } from "@/lib/lab/terminalEngine";
import { resolveVirtualShellCommand } from "@/lib/lab/virtualShell";
import type { SessionState } from "@/lib/lab/sessionState";
import type { LabScenario } from "@/lib/llm/schemas";

export interface RunCommandParams {
  scenario: LabScenario;
  rawCommand: string;
  state: SessionState;
}

export interface RunCommandResult {
  output: string;
  newState: SessionState;
  source: "PRESET" | "SIMULATED";
}

/**
 * Diễn giải một lệnh gõ trong lab terminal: thử khớp `presetCommands` của scenario trước
 * (nội dung do người soạn lab viết sẵn, ưu tiên cao nhất), rồi fallback sang virtual shell
 * rule-based (không gọi LLM — xem src/lib/lab/virtualShell.ts) cho các lệnh chẩn đoán Linux
 * phổ biến dựa trực tiếp trên SessionState hiện tại.
 */
export function resolveCommand(params: RunCommandParams): RunCommandResult {
  const preset = matchPresetCommand(params.scenario, params.rawCommand);
  if (preset) {
    const newState = preset.stateEffect
      ? applyStatePatch(params.state, preset.stateEffect.patch)
      : params.state;
    return { output: preset.output, newState, source: "PRESET" };
  }

  const output = resolveVirtualShellCommand(params.rawCommand, params.state);
  return { output, newState: params.state, source: "SIMULATED" };
}
