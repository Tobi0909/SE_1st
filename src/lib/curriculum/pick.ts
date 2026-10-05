import type { Difficulty } from "@/generated/prisma/client";
import { getCurriculum, type CurriculumArea } from "@/lib/curriculum/data";

/**
 * Chọn ngẫu nhiên tối đa `count` mảng kiến thức cho 1 chủ đề + độ khó, ưu tiên mảng chưa có
 * trong `excludeTitles` (đã bao phủ gần đây) — hết mảng mới dùng thì quay vòng lại toàn bộ
 * tier đó. Trả mảng rỗng nếu chủ đề không có curriculum (chủ đề admin tự tạo) — gọi nơi dùng
 * phải tự fallback về hành vi sinh tự do.
 */
export function pickCurriculumAreas(
  topicSlug: string,
  difficulty: Difficulty,
  count: number,
  excludeTitles: string[] = [],
): CurriculumArea[] {
  const curriculum = getCurriculum(topicSlug);
  if (!curriculum) return [];

  const areas = curriculum[difficulty];
  const remaining = areas.filter((a) => !excludeTitles.includes(a.title));
  const pool = remaining.length > 0 ? remaining : areas;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.max(count, 1));
}
