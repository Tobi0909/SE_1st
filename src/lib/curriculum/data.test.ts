import { describe, expect, it } from "vitest";

import { CURRICULUM } from "@/lib/curriculum/data";

const TIERS = ["EASY", "MEDIUM", "HARD"] as const;

describe("CURRICULUM", () => {
  it("mỗi chủ đề có đủ 3 tier, mỗi tier có ít nhất 3 mảng kiến thức", () => {
    for (const [slug, curriculum] of Object.entries(CURRICULUM)) {
      for (const tier of TIERS) {
        expect(curriculum[tier], `${slug}.${tier}`).toBeDefined();
        expect(curriculum[tier].length, `${slug}.${tier} quá ít mảng kiến thức`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("title không rỗng và không trùng lặp trong cùng 1 tier", () => {
    for (const [slug, curriculum] of Object.entries(CURRICULUM)) {
      for (const tier of TIERS) {
        const titles = curriculum[tier].map((a) => a.title);
        for (const title of titles) {
          expect(title.trim().length, `${slug}.${tier} có title rỗng`).toBeGreaterThan(0);
        }
        expect(new Set(titles).size, `${slug}.${tier} có title trùng lặp`).toBe(titles.length);
      }
    }
  });

  it("mỗi mảng kiến thức có summary không rỗng", () => {
    for (const [slug, curriculum] of Object.entries(CURRICULUM)) {
      for (const tier of TIERS) {
        for (const area of curriculum[tier]) {
          expect(area.summary.trim().length, `${slug}.${tier}.${area.title}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("có đủ curriculum cho 7 chủ đề mẫu trong prisma/seed.ts", () => {
    const seedSlugs = [
      "linux",
      "networking",
      "virtualization",
      "container",
      "monitoring-logging",
      "cicd-iac",
      "security-hardening",
    ];
    for (const slug of seedSlugs) {
      expect(CURRICULUM[slug], `thiếu curriculum cho chủ đề "${slug}"`).toBeDefined();
    }
  });
});
