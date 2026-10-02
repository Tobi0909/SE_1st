import { describe, expect, it } from "vitest";

import { aggregateParentStatus, computeLeafStatus, countMasteredLeaves } from "@/lib/roadmap/nodeStatus";

describe("computeLeafStatus", () => {
  it("chưa làm gì -> NOT_STARTED", () => {
    const status = computeLeafStatus({
      totalAttempts: 0,
      correctAttempts: 0,
      hasLinkedLabs: false,
      labAttempted: false,
      labPassed: false,
    });
    expect(status).toBe("NOT_STARTED");
  });

  it("đã làm vài câu nhưng chưa đủ ngưỡng -> IN_PROGRESS", () => {
    const status = computeLeafStatus({
      totalAttempts: 2,
      correctAttempts: 2,
      hasLinkedLabs: false,
      labAttempted: false,
      labPassed: false,
    });
    expect(status).toBe("IN_PROGRESS");
  });

  it("đủ số lần + accuracy cao, không có lab gắn -> MASTERED", () => {
    const status = computeLeafStatus({
      totalAttempts: 10,
      correctAttempts: 9,
      hasLinkedLabs: false,
      labAttempted: false,
      labPassed: false,
    });
    expect(status).toBe("MASTERED");
  });

  it("đủ điều kiện quiz nhưng accuracy dưới ngưỡng -> IN_PROGRESS", () => {
    const status = computeLeafStatus({
      totalAttempts: 10,
      correctAttempts: 5,
      hasLinkedLabs: false,
      labAttempted: false,
      labPassed: false,
    });
    expect(status).toBe("IN_PROGRESS");
  });

  it("quiz đạt nhưng có lab gắn và chưa pass lab -> IN_PROGRESS", () => {
    const status = computeLeafStatus({
      totalAttempts: 10,
      correctAttempts: 9,
      hasLinkedLabs: true,
      labAttempted: true,
      labPassed: false,
    });
    expect(status).toBe("IN_PROGRESS");
  });

  it("quiz đạt + lab gắn và đã pass -> MASTERED", () => {
    const status = computeLeafStatus({
      totalAttempts: 10,
      correctAttempts: 9,
      hasLinkedLabs: true,
      labAttempted: true,
      labPassed: true,
    });
    expect(status).toBe("MASTERED");
  });

  it("chỉ mới làm lab (chưa quiz) -> IN_PROGRESS", () => {
    const status = computeLeafStatus({
      totalAttempts: 0,
      correctAttempts: 0,
      hasLinkedLabs: true,
      labAttempted: true,
      labPassed: false,
    });
    expect(status).toBe("IN_PROGRESS");
  });
});

describe("aggregateParentStatus", () => {
  it("không có children -> NOT_STARTED", () => {
    expect(aggregateParentStatus([])).toBe("NOT_STARTED");
  });

  it("tất cả children MASTERED -> MASTERED", () => {
    expect(aggregateParentStatus(["MASTERED", "MASTERED"])).toBe("MASTERED");
  });

  it("có ít nhất 1 children đang học hoặc đã xong -> IN_PROGRESS", () => {
    expect(aggregateParentStatus(["NOT_STARTED", "IN_PROGRESS"])).toBe("IN_PROGRESS");
    expect(aggregateParentStatus(["NOT_STARTED", "MASTERED"])).toBe("IN_PROGRESS");
  });

  it("tất cả children NOT_STARTED -> NOT_STARTED", () => {
    expect(aggregateParentStatus(["NOT_STARTED", "NOT_STARTED"])).toBe("NOT_STARTED");
  });
});

describe("countMasteredLeaves", () => {
  it("chỉ đếm node lá (không children), bỏ qua node nhóm", () => {
    const result = countMasteredLeaves([
      {
        status: "IN_PROGRESS",
        children: [
          { status: "MASTERED", children: [] },
          { status: "NOT_STARTED", children: [] },
        ],
      },
      { status: "MASTERED", children: [] },
    ]);
    expect(result).toEqual({ total: 3, mastered: 2 });
  });

  it("cây rỗng -> 0/0", () => {
    expect(countMasteredLeaves([])).toEqual({ total: 0, mastered: 0 });
  });
});
