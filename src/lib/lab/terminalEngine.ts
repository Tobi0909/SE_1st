import type { LabScenario, StatePatchOp } from "@/lib/llm/schemas";
import type { ServiceStatus, SessionState } from "@/lib/lab/sessionState";

export interface PresetMatch {
  output: string;
  stateEffect?: { description: string; patch: StatePatchOp[] };
}

export function normalizeCommand(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/**
 * Khớp lệnh người dùng gõ với bảng `presetCommands` của scenario, theo thứ tự khai báo
 * (exact -> startsWith -> regex tuỳ preset, không ưu tiên loại nào — preset đứng trước thắng).
 */
export function matchPresetCommand(scenario: LabScenario, rawCommand: string): PresetMatch | null {
  const command = normalizeCommand(rawCommand);

  for (const preset of scenario.presetCommands) {
    if (matchesPattern(preset.match, command)) {
      return { output: preset.output, stateEffect: preset.stateEffect };
    }
  }
  return null;
}

function matchesPattern(match: LabScenario["presetCommands"][number]["match"], command: string): boolean {
  switch (match.type) {
    case "exact":
      return command === match.pattern;
    case "startsWith":
      return command.startsWith(match.pattern);
    case "regex":
      try {
        return new RegExp(match.pattern).test(command);
      } catch {
        return false;
      }
  }
}

/**
 * Áp một danh sách patch vào SessionState, trả về state MỚI (không mutate state truyền vào).
 *
 * Quy ước `path`: `"<bucket>:<key>[.field]"` — bucket là `services` | `files` | `logs`.
 *   - `services:<name>.status|port|configPath` — set/remove một field của service; không có
 *     field thì set/remove cả object service.
 *   - `files:<đường-dẫn-tuyệt-đối>` — set = nội dung mới, remove = xoá file.
 *   - `logs:<nguồn-log>` — append = thêm 1 dòng, set = thay cả mảng, remove = xoá nguồn log.
 * Path không đúng quy ước hoặc bucket lạ bị bỏ qua (không throw) — một patch lỗi từ LLM
 * không được làm hỏng cả phiên.
 */
export function applyStatePatch(state: SessionState, patch: StatePatchOp[]): SessionState {
  const next: SessionState = structuredClone(state);
  for (const op of patch) {
    applyOne(next, op);
  }
  return next;
}

function applyOne(state: SessionState, op: StatePatchOp): void {
  const sep = op.path.indexOf(":");
  if (sep === -1) return;

  const bucket = op.path.slice(0, sep);
  const rest = op.path.slice(sep + 1);
  if (!rest) return;

  if (bucket === "services") return applyServicePatch(state, rest, op);
  if (bucket === "files") return applyFilePatch(state, rest, op);
  if (bucket === "logs") return applyLogPatch(state, rest, op);
}

function applyServicePatch(state: SessionState, rest: string, op: StatePatchOp): void {
  const lastDot = rest.lastIndexOf(".");
  const name = lastDot === -1 ? rest : rest.slice(0, lastDot);
  const field = lastDot === -1 ? undefined : rest.slice(lastDot + 1);

  if (op.op === "remove" && !field) {
    delete state.services[name];
    return;
  }

  if (!state.services[name]) state.services[name] = { status: "stopped" };

  if (field === "status") {
    state.services[name].status = op.value as ServiceStatus;
  } else if (field === "port") {
    state.services[name].port = op.value as number;
  } else if (field === "configPath") {
    state.services[name].configPath = op.value as string;
  } else if (!field && op.op !== "remove" && op.value && typeof op.value === "object") {
    Object.assign(state.services[name], op.value);
  }
}

function applyFilePatch(state: SessionState, path: string, op: StatePatchOp): void {
  if (op.op === "remove") {
    delete state.files[path];
    return;
  }
  state.files[path] = String(op.value ?? "");
}

function applyLogPatch(state: SessionState, source: string, op: StatePatchOp): void {
  if (op.op === "remove") {
    delete state.logs[source];
    return;
  }
  if (op.op === "append") {
    if (!state.logs[source]) state.logs[source] = [];
    state.logs[source].push(String(op.value ?? ""));
    return;
  }
  state.logs[source] = Array.isArray(op.value) ? (op.value as string[]) : [String(op.value ?? "")];
}
