import type { LabScenario, VirtualFsNode } from "@/lib/llm/schemas";

export type ServiceStatus = "running" | "stopped" | "failed";

export interface SessionServiceState {
  status: ServiceStatus;
  port?: number;
  configPath?: string;
}

/**
 * Trạng thái sống của một LabSession — khác với `scenario.hiddenState` (dữ liệu gốc do LLM
 * sinh, bất biến): state này là bản sao có thể bị `applyStatePatch` chỉnh sửa theo từng lệnh.
 * Dùng map theo key (tên service / đường dẫn file) thay vì mảng/cây như hiddenState để
 * `applyStatePatch` địa chỉ hoá trực tiếp bằng path, không cần tìm kiếm.
 */
export interface SessionState {
  services: Record<string, SessionServiceState>;
  files: Record<string, string>;
  logs: Record<string, string[]>;
}

export function buildInitialSessionState(scenario: LabScenario): SessionState {
  const services: SessionState["services"] = {};
  for (const s of scenario.hiddenState.services) {
    services[s.name] = { status: s.status, port: s.port, configPath: s.configPath };
  }

  const files: SessionState["files"] = {};
  collectFiles(scenario.hiddenState.filesystem, files);

  return { services, files, logs: structuredClone(scenario.hiddenState.logs) };
}

function collectFiles(nodes: VirtualFsNode[], out: Record<string, string>): void {
  for (const node of nodes) {
    if (node.type === "file") out[node.name] = node.content ?? "";
    if (node.children) collectFiles(node.children, out);
  }
}
