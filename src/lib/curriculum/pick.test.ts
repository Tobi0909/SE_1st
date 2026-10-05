import { describe, expect, it } from "vitest";

import { pickCurriculumAreas } from "@/lib/curriculum/pick";

describe("pickCurriculumAreas", () => {
  it("trả mảng rỗng cho chủ đề không có curriculum", () => {
    expect(pickCurriculumAreas("chu-de-khong-ton-tai", "EASY", 3)).toEqual([]);
  });

  it("trả đúng số lượng yêu cầu khi còn đủ mảng chưa dùng", () => {
    const result = pickCurriculumAreas("linux", "EASY", 2);
    expect(result).toHaveLength(2);
  });

  it("không trả nhiều hơn số mảng thực có trong tier", () => {
    const result = pickCurriculumAreas("linux", "EASY", 1000);
    expect(result.length).toBeLessThanOrEqual(8); // linux.EASY có 8 mảng tại thời điểm viết
    expect(result.length).toBeGreaterThan(0);
  });

  it("ưu tiên mảng không nằm trong excludeTitles", () => {
    const all = pickCurriculumAreas("linux", "EASY", 100);
    const titles = all.map((a) => a.title);
    const excluded = titles.slice(0, titles.length - 1); // loại trừ tất cả trừ 1 mảng

    const result = pickCurriculumAreas("linux", "EASY", 1, excluded);
    expect(result).toHaveLength(1);
    expect(excluded).not.toContain(result[0].title);
  });

  it("quay vòng lại toàn bộ tier khi excludeTitles chứa hết mọi mảng", () => {
    const all = pickCurriculumAreas("linux", "EASY", 100);
    const allTitles = all.map((a) => a.title);

    const result = pickCurriculumAreas("linux", "EASY", 3, allTitles);
    expect(result).toHaveLength(3);
  });
});
