import type { Difficulty } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { getLLMProvider } from "@/lib/llm/provider";
import type { SkillTreeNode } from "@/lib/llm/schemas";
import {
  LAB_PASS_SCORE,
  aggregateParentStatus,
  computeLeafStatus,
  countMasteredLeaves,
  type NodeStatus,
} from "@/lib/roadmap/nodeStatus";

export async function ensureSkillTree(topicId: string, userId: string | null): Promise<void> {
  const count = await db.skillNode.count({ where: { topicId } });
  if (count > 0) return;

  const topic = await db.topic.findUniqueOrThrow({ where: { id: topicId } });
  const provider = await getLLMProvider();
  const tree = await provider.generateSkillTree({ userId, topicName: topic.name, topicSlug: topic.slug });

  await createNodesRecursive(topicId, tree.nodes, null);
}

async function createNodesRecursive(
  topicId: string,
  nodes: SkillTreeNode[],
  parentId: string | null,
): Promise<void> {
  for (let order = 0; order < nodes.length; order++) {
    const n = nodes[order];
    const created = await db.skillNode.create({
      data: {
        topicId,
        parentId,
        title: n.title,
        description: n.description,
        difficulty: n.difficulty ?? null,
        order,
      },
    });

    if (n.difficulty) {
      const scenarios = await db.labScenario.findMany({
        where: { topicId, difficulty: n.difficulty, status: "ACTIVE" },
        select: { id: true },
      });
      if (scenarios.length > 0) {
        await db.labScenarioNode.createMany({
          data: scenarios.map((s) => ({ nodeId: created.id, scenarioId: s.id })),
          skipDuplicates: true,
        });
      }
    }

    if (n.children?.length) {
      await createNodesRecursive(topicId, n.children, created.id);
    }
  }
}

export interface RoadmapNode {
  id: string;
  title: string;
  description: string | null;
  difficulty: Difficulty | null;
  status: NodeStatus;
  children: RoadmapNode[];
}

export async function computeTopicRoadmap(userId: string, topicId: string): Promise<RoadmapNode[]> {
  const nodes = await db.skillNode.findMany({
    where: { topicId },
    include: { labLinks: true },
    orderBy: { order: "asc" },
  });

  const attempts = await db.quizAttempt.findMany({
    where: { userId, question: { topicId } },
    select: { correct: true, question: { select: { difficulty: true } } },
  });
  const accuracyByDifficulty = new Map<Difficulty, { total: number; correct: number }>();
  for (const a of attempts) {
    const entry = accuracyByDifficulty.get(a.question.difficulty) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (a.correct) entry.correct += 1;
    accuracyByDifficulty.set(a.question.difficulty, entry);
  }

  const allScenarioIds = [...new Set(nodes.flatMap((n) => n.labLinks.map((l) => l.scenarioId)))];
  const sessions =
    allScenarioIds.length > 0
      ? await db.labSession.findMany({
          where: { userId, scenarioId: { in: allScenarioIds } },
          include: { submission: true },
        })
      : [];
  const sessionsByScenario = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const arr = sessionsByScenario.get(s.scenarioId) ?? [];
    arr.push(s);
    sessionsByScenario.set(s.scenarioId, arr);
  }

  function buildNode(node: (typeof nodes)[number]): RoadmapNode {
    const children = nodes.filter((n) => n.parentId === node.id).map(buildNode);

    let status: NodeStatus;
    if (children.length === 0) {
      const stat = node.difficulty
        ? (accuracyByDifficulty.get(node.difficulty) ?? { total: 0, correct: 0 })
        : { total: 0, correct: 0 };
      const linkedScenarioIds = node.labLinks.map((l) => l.scenarioId);
      const linkedSessions = linkedScenarioIds.flatMap((id) => sessionsByScenario.get(id) ?? []);
      const labAttempted = linkedSessions.length > 0;
      const labPassed = linkedSessions.some((s) => {
        const total = (s.submission?.score as { total?: number } | null)?.total ?? 0;
        return total >= LAB_PASS_SCORE;
      });
      status = computeLeafStatus({
        totalAttempts: stat.total,
        correctAttempts: stat.correct,
        hasLinkedLabs: linkedScenarioIds.length > 0,
        labAttempted,
        labPassed,
      });
    } else {
      status = aggregateParentStatus(children.map((c) => c.status));
    }

    return {
      id: node.id,
      title: node.title,
      description: node.description,
      difficulty: node.difficulty,
      status,
      children,
    };
  }

  const roots = nodes.filter((n) => !n.parentId);
  return roots.map(buildNode);
}

export interface TopicProgressSummary {
  topic: { id: string; slug: string; name: string };
  total: number;
  mastered: number;
  generated: boolean;
}

/** Tiến độ mọi chủ đề cho 1 user. Chỉ tính chủ đề đã có roadmap — không tự sinh LLM ở đây để
 * tránh gọi LLM hàng loạt khi chỉ xem trang tổng quan (sinh roadmap xảy ra ở trang chi tiết). */
export async function getAllTopicsProgress(userId: string): Promise<TopicProgressSummary[]> {
  const topics = await db.topic.findMany({ orderBy: { order: "asc" } });

  return Promise.all(
    topics.map(async (topic) => {
      const nodeCount = await db.skillNode.count({ where: { topicId: topic.id } });
      if (nodeCount === 0) return { topic, total: 0, mastered: 0, generated: false };

      const roadmap = await computeTopicRoadmap(userId, topic.id);
      const { total, mastered } = countMasteredLeaves(roadmap);
      return { topic, total, mastered, generated: true };
    }),
  );
}
