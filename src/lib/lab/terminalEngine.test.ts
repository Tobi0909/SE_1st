import { describe, expect, it } from "vitest";

import { applyStatePatch, matchPresetCommand, normalizeCommand } from "@/lib/lab/terminalEngine";
import type { LabScenario } from "@/lib/llm/schemas";
import type { SessionState } from "@/lib/lab/sessionState";

const scenario: LabScenario = {
  version: 1,
  title: "Nginx không khởi động được",
  topicSlug: "linux",
  difficulty: "MEDIUM",
  briefing: { context: "...", symptoms: ["curl connection refused"] },
  hiddenState: {
    filesystem: [{ name: "/etc/nginx/nginx.conf", type: "file", content: "bad config" }],
    services: [{ name: "nginx", status: "stopped", port: 80 }],
    logs: { "journalctl -u nginx": ["Failed with result 'exit-code'"] },
  },
  rootCause: { summary: "Lỗi cú pháp cấu hình", explanation: "..." },
  completionCriteria: {
    requiredFindings: ["nginx đang stopped"],
    rubric: [{ criterion: "Xác định đúng service lỗi", weight: 50 }],
  },
  presetCommands: [
    { match: { type: "exact", pattern: "systemctl status nginx" }, output: "Active: failed" },
    {
      match: { type: "exact", pattern: "systemctl restart nginx" },
      output: "",
      stateEffect: {
        description: "nginx chuyển sang running",
        patch: [{ op: "set", path: "services:nginx.status", value: "running" }],
      },
    },
    { match: { type: "startsWith", pattern: "cat /etc/nginx" }, output: "bad config" },
    { match: { type: "regex", pattern: "^ping -c \\d+ .+$" }, output: "PING ok" },
  ],
  hints: ["Gợi ý 1", "Gợi ý 2", "Gợi ý 3"],
};

describe("normalizeCommand", () => {
  it("trim và gộp khoảng trắng thừa", () => {
    expect(normalizeCommand("  systemctl   status   nginx  ")).toBe("systemctl status nginx");
  });
});

describe("matchPresetCommand", () => {
  it("khớp exact", () => {
    const result = matchPresetCommand(scenario, "systemctl status nginx");
    expect(result?.output).toBe("Active: failed");
  });

  it("khớp exact kể cả khi có khoảng trắng thừa (đã normalize)", () => {
    const result = matchPresetCommand(scenario, "  systemctl  status  nginx ");
    expect(result?.output).toBe("Active: failed");
  });

  it("khớp startsWith", () => {
    const result = matchPresetCommand(scenario, "cat /etc/nginx/nginx.conf");
    expect(result?.output).toBe("bad config");
  });

  it("khớp regex", () => {
    const result = matchPresetCommand(scenario, "ping -c 4 8.8.8.8");
    expect(result?.output).toBe("PING ok");
  });

  it("trả null khi không khớp preset nào", () => {
    const result = matchPresetCommand(scenario, "some-unknown-command --foo");
    expect(result).toBeNull();
  });

  it("trả về stateEffect khi preset có khai báo", () => {
    const result = matchPresetCommand(scenario, "systemctl restart nginx");
    expect(result?.stateEffect?.patch).toHaveLength(1);
  });
});

describe("applyStatePatch", () => {
  const baseState: SessionState = {
    services: { nginx: { status: "stopped", port: 80 } },
    files: { "/etc/nginx/nginx.conf": "bad config" },
    logs: { "journalctl -u nginx": ["Failed with result 'exit-code'"] },
  };

  it("set field của service", () => {
    const next = applyStatePatch(baseState, [
      { op: "set", path: "services:nginx.status", value: "running" },
    ]);
    expect(next.services.nginx.status).toBe("running");
    expect(next.services.nginx.port).toBe(80);
  });

  it("không mutate state gốc (trả về bản sao)", () => {
    applyStatePatch(baseState, [{ op: "set", path: "services:nginx.status", value: "running" }]);
    expect(baseState.services.nginx.status).toBe("stopped");
  });

  it("set nội dung file", () => {
    const next = applyStatePatch(baseState, [
      { op: "set", path: "files:/etc/nginx/nginx.conf", value: "good config" },
    ]);
    expect(next.files["/etc/nginx/nginx.conf"]).toBe("good config");
  });

  it("remove file", () => {
    const next = applyStatePatch(baseState, [
      { op: "remove", path: "files:/etc/nginx/nginx.conf" },
    ]);
    expect(next.files["/etc/nginx/nginx.conf"]).toBeUndefined();
  });

  it("append log line", () => {
    const next = applyStatePatch(baseState, [
      { op: "append", path: "logs:journalctl -u nginx", value: "Started nginx." },
    ]);
    expect(next.logs["journalctl -u nginx"]).toEqual([
      "Failed with result 'exit-code'",
      "Started nginx.",
    ]);
  });

  it("tạo service mới nếu patch nhắm vào service chưa tồn tại", () => {
    const next = applyStatePatch(baseState, [
      { op: "set", path: "services:sshd.status", value: "running" },
    ]);
    expect(next.services.sshd).toEqual({ status: "running" });
  });

  it("bỏ qua patch có path không đúng quy ước (không throw)", () => {
    expect(() =>
      applyStatePatch(baseState, [{ op: "set", path: "không-có-dấu-hai-chấm", value: "x" }]),
    ).not.toThrow();
  });

  it("áp nhiều patch tuần tự", () => {
    const next = applyStatePatch(baseState, [
      { op: "set", path: "services:nginx.status", value: "running" },
      { op: "append", path: "logs:journalctl -u nginx", value: "Started nginx." },
    ]);
    expect(next.services.nginx.status).toBe("running");
    expect(next.logs["journalctl -u nginx"]).toHaveLength(2);
  });
});
