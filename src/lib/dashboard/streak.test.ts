import { describe, expect, it } from "vitest";

import { computeStreak, toDateKey } from "@/lib/dashboard/streak";

const TODAY = new Date("2026-01-10T12:00:00.000Z");

function daysBefore(n: number): string {
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - n);
  return toDateKey(d);
}

describe("computeStreak", () => {
  it("không có hoạt động -> 0", () => {
    expect(computeStreak([], TODAY)).toBe(0);
  });

  it("chỉ có hoạt động hôm nay -> 1", () => {
    expect(computeStreak([daysBefore(0)], TODAY)).toBe(1);
  });

  it("hoạt động liên tục 3 ngày tính đến hôm nay -> 3", () => {
    expect(computeStreak([daysBefore(0), daysBefore(1), daysBefore(2)], TODAY)).toBe(3);
  });

  it("có khoảng trống giữa chừng -> chỉ tính đoạn liên tục gần nhất", () => {
    // hôm nay + hôm qua có, nhưng 2 ngày trước thì không -> streak = 2
    expect(computeStreak([daysBefore(0), daysBefore(1), daysBefore(3)], TODAY)).toBe(2);
  });

  it("chưa có hoạt động hôm nay nhưng hôm qua có -> vẫn tính streak từ hôm qua", () => {
    expect(computeStreak([daysBefore(1), daysBefore(2)], TODAY)).toBe(2);
  });

  it("hoạt động gần nhất là 2 ngày trước (hôm qua cũng không có) -> streak đã đứt, 0", () => {
    expect(computeStreak([daysBefore(2), daysBefore(3)], TODAY)).toBe(0);
  });
});

describe("toDateKey", () => {
  it("trả về dạng YYYY-MM-DD theo UTC", () => {
    expect(toDateKey(new Date("2026-03-05T23:59:00.000Z"))).toBe("2026-03-05");
  });
});
