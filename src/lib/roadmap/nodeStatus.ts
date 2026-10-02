export type NodeStatus = "NOT_STARTED" | "IN_PROGRESS" | "MASTERED";

export const MASTERY_ACCURACY = 0.8;
export const MIN_ATTEMPTS_FOR_MASTERY = 5;
export const LAB_PASS_SCORE = 70;

export interface LeafStats {
  totalAttempts: number;
  correctAttempts: number;
  hasLinkedLabs: boolean;
  labAttempted: boolean;
  labPassed: boolean;
}

/** Trạng thái 1 node lá (có `difficulty`, gắn trực tiếp với 1 tier quiz/lab). */
export function computeLeafStatus(stats: LeafStats): NodeStatus {
  const accuracy = stats.totalAttempts > 0 ? stats.correctAttempts / stats.totalAttempts : 0;
  const quizMastered = stats.totalAttempts >= MIN_ATTEMPTS_FOR_MASTERY && accuracy >= MASTERY_ACCURACY;
  const labRequirementMet = !stats.hasLinkedLabs || stats.labPassed;

  if (quizMastered && labRequirementMet) return "MASTERED";
  if (stats.totalAttempts > 0 || stats.labAttempted) return "IN_PROGRESS";
  return "NOT_STARTED";
}

/** Trạng thái 1 node nhóm (không có `difficulty`, chỉ có children) suy ra từ children. */
export function aggregateParentStatus(childStatuses: NodeStatus[]): NodeStatus {
  if (childStatuses.length === 0) return "NOT_STARTED";
  if (childStatuses.every((s) => s === "MASTERED")) return "MASTERED";
  if (childStatuses.some((s) => s === "MASTERED" || s === "IN_PROGRESS")) return "IN_PROGRESS";
  return "NOT_STARTED";
}

export interface StatusTreeNode {
  status: NodeStatus;
  children: StatusTreeNode[];
}

/** Đếm % hoàn thành theo node LÁ (node không có children) trong cả cây. */
export function countMasteredLeaves(nodes: StatusTreeNode[]): { total: number; mastered: number } {
  let total = 0;
  let mastered = 0;

  const walk = (list: StatusTreeNode[]) => {
    for (const node of list) {
      if (node.children.length > 0) {
        walk(node.children);
        continue;
      }
      total += 1;
      if (node.status === "MASTERED") mastered += 1;
    }
  };

  walk(nodes);
  return { total, mastered };
}
