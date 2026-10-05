import { describe, expect, it } from "vitest";

import { CURRICULUM } from "@/lib/curriculum/data";
import { buildSkillTreeFromCurriculum } from "@/lib/curriculum/skillTree";
import { SkillTreeSchema } from "@/lib/llm/schemas";

describe("buildSkillTreeFromCurriculum", () => {
  const tree = buildSkillTreeFromCurriculum(CURRICULUM.linux);

  it("sinh đúng schema (qua được SkillTreeSchema như output LLM)", () => {
    expect(SkillTreeSchema.safeParse(tree).success).toBe(true);
  });

  it("có đúng 3 node gốc (Cơ bản/Trung bình/Nâng cao), không có difficulty ở node gốc", () => {
    expect(tree.nodes).toHaveLength(3);
    for (const node of tree.nodes) {
      expect(node.difficulty).toBeUndefined();
      expect(node.children?.length).toBeGreaterThan(0);
    }
  });

  it("mọi node lá có difficulty khớp với tier cha và không có children", () => {
    const tiers: Array<"EASY" | "MEDIUM" | "HARD"> = ["EASY", "MEDIUM", "HARD"];
    tree.nodes.forEach((node, i) => {
      for (const child of node.children ?? []) {
        expect(child.difficulty).toBe(tiers[i]);
        expect(child.children).toBeUndefined();
      }
    });
  });

  it("tổng số node lá khớp tổng số mảng kiến thức trong curriculum", () => {
    const totalAreas =
      CURRICULUM.linux.EASY.length + CURRICULUM.linux.MEDIUM.length + CURRICULUM.linux.HARD.length;
    const totalLeaves = tree.nodes.reduce((sum, n) => sum + (n.children?.length ?? 0), 0);
    expect(totalLeaves).toBe(totalAreas);
  });
});
