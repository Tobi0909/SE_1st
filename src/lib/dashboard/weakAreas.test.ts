import { describe, expect, it } from "vitest";

import { pickWeakAreas, type AccuracyBucket } from "@/lib/dashboard/weakAreas";

const buckets: AccuracyBucket[] = [
  { topicId: "t1", topicSlug: "linux", topicName: "Linux", difficulty: "EASY", total: 10, correct: 9 },
  { topicId: "t2", topicSlug: "networking", topicName: "Networking", difficulty: "MEDIUM", total: 10, correct: 3 },
  { topicId: "t3", topicSlug: "security-hardening", topicName: "Security", difficulty: "HARD", total: 2, correct: 0 },
  { topicId: "t4", topicSlug: "container", topicName: "Container", difficulty: "EASY", total: 5, correct: 2 },
];

describe("pickWeakAreas", () => {
  it("sắp xếp accuracy tăng dần, lấy thấp nhất trước", () => {
    const result = pickWeakAreas(buckets, { limit: 2 });
    expect(result.map((r) => r.topicId)).toEqual(["t2", "t4"]);
  });

  it("bỏ qua bucket chưa đủ minAttempts", () => {
    const result = pickWeakAreas(buckets, { minAttempts: 3 });
    expect(result.some((r) => r.topicId === "t3")).toBe(false);
  });

  it("tính đúng accuracy", () => {
    const result = pickWeakAreas(buckets, { limit: 1 });
    expect(result[0].accuracy).toBeCloseTo(0.3);
  });

  it("danh sách rỗng -> trả về rỗng", () => {
    expect(pickWeakAreas([])).toEqual([]);
  });
});
