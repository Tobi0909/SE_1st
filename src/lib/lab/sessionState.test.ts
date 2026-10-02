import { describe, expect, it } from "vitest";

import { buildInitialSessionState } from "@/lib/lab/sessionState";
import type { LabScenario } from "@/lib/llm/schemas";

const scenario: LabScenario = {
  version: 1,
  title: "Nginx không khởi động được",
  topicSlug: "linux",
  difficulty: "MEDIUM",
  briefing: { context: "...", symptoms: ["curl connection refused"] },
  hiddenState: {
    filesystem: [
      { name: "/etc/nginx/nginx.conf", type: "file", content: "bad config" },
      {
        name: "/etc/nginx",
        type: "dir",
        children: [{ name: "/etc/nginx/conf.d/default.conf", type: "file", content: "server {}" }],
      },
    ],
    services: [{ name: "nginx", status: "stopped", port: 80 }],
    logs: { "journalctl -u nginx": ["Failed with result 'exit-code'"] },
  },
  rootCause: { summary: "x", explanation: "y" },
  completionCriteria: { requiredFindings: ["a"], rubric: [{ criterion: "a", weight: 100 }] },
  presetCommands: [],
  hints: ["1", "2", "3"],
};

describe("buildInitialSessionState", () => {
  it("chuyển services array -> map theo tên", () => {
    const state = buildInitialSessionState(scenario);
    expect(state.services.nginx).toEqual({ status: "stopped", port: 80, configPath: undefined });
  });

  it("gom file ở cả cấp gốc và trong children -> map theo path", () => {
    const state = buildInitialSessionState(scenario);
    expect(state.files["/etc/nginx/nginx.conf"]).toBe("bad config");
    expect(state.files["/etc/nginx/conf.d/default.conf"]).toBe("server {}");
  });

  it("sao chép logs, không giữ tham chiếu tới scenario gốc", () => {
    const state = buildInitialSessionState(scenario);
    state.logs["journalctl -u nginx"].push("new line");
    expect(scenario.hiddenState.logs["journalctl -u nginx"]).toHaveLength(1);
  });
});
