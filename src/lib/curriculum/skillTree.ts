import type { Difficulty } from "@/generated/prisma/client";
import type { TopicCurriculum } from "@/lib/curriculum/data";
import type { SkillTree, SkillTreeNode } from "@/lib/llm/schemas";

const TIER_ORDER: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

const TIER_LABEL: Record<Difficulty, { title: string; description: string }> = {
  EASY: { title: "Cơ bản", description: "Nền tảng cần nắm trước khi đi sâu hơn." },
  MEDIUM: { title: "Trung bình", description: "Kỹ năng vận hành thực tế hằng ngày." },
  HARD: { title: "Nâng cao", description: "Troubleshooting và thiết kế hệ thống phức tạp." },
};

/**
 * Dựng skill tree TRỰC TIẾP từ curriculum đã viết tay — KHÔNG gọi LLM. Dùng cho chủ đề có
 * trong `CURRICULUM` (xem data.ts); chủ đề admin tự tạo không có curriculum thì vẫn phải gọi
 * `provider.generateSkillTree` như cũ (xem `ensureSkillTree` trong lib/roadmap/progress.ts).
 * Quyết định này loại hoàn toàn rủi ro LLM hallucination cho CẤU TRÚC roadmap — xem ADR-005.
 */
export function buildSkillTreeFromCurriculum(curriculum: TopicCurriculum): SkillTree {
  const nodes: SkillTreeNode[] = TIER_ORDER.map((difficulty) => ({
    title: TIER_LABEL[difficulty].title,
    description: TIER_LABEL[difficulty].description,
    children: curriculum[difficulty].map((area) => ({
      title: area.title,
      description: area.summary,
      difficulty,
    })),
  }));

  return { nodes };
}
