import { describe, expect, it } from "vitest";

import { hashState } from "@/lib/lab/stateHash";

describe("hashState", () => {
  it("cùng nội dung, thứ tự key khác nhau -> hash giống nhau", () => {
    const a = hashState({ services: { nginx: { status: "running" } }, port: 80 });
    const b = hashState({ port: 80, services: { nginx: { status: "running" } } });
    expect(a).toBe(b);
  });

  it("nội dung khác nhau -> hash khác nhau", () => {
    const a = hashState({ services: { nginx: { status: "running" } } });
    const b = hashState({ services: { nginx: { status: "stopped" } } });
    expect(a).not.toBe(b);
  });

  it("mảng giữ nguyên thứ tự ảnh hưởng tới hash", () => {
    const a = hashState({ logs: ["a", "b"] });
    const b = hashState({ logs: ["b", "a"] });
    expect(a).not.toBe(b);
  });

  it("deterministic qua nhiều lần gọi", () => {
    const state = { services: { nginx: { status: "stopped", port: 80 } }, files: {} };
    expect(hashState(state)).toBe(hashState(state));
  });
});
