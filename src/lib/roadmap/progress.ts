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

interface SkillNodeWithLinks {
  id: string;
  parentId: string | null;
  title: string;
  description: string | null;
  difficulty: Difficulty | null;
  order: number;
  labLinks: { scenarioId: string }[];
}

interface LabSessionWithScore {
  scenarioId: string;
  submission: { score: unknown } | null;
}

/** Xây cây trạng thái THUẦN từ dữ liệu đã fetch sẵn — không tự query DB, để tái sử dụng được
 * cho cả đường 1-user-1-topic (`computeTopicRoadmap`) lẫn đường bulk nhiều user/nhiều topic
 * (`getAllTopicsProgress`, `getTeamOverview`) mà không nhân số lần round-trip DB lên. */
function buildRoadmapTree(
  nodes: SkillNodeWithLinks[],
  accuracyByDifficulty: Map<Difficulty, { total: number; correct: number }>,
  sessionsByScenario: Map<string, LabSessionWithScore[]>,
): RoadmapNode[] {
  function buildNode(node: SkillNodeWithLinks): RoadmapNode {
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

  return nodes.filter((n) => !n.parentId).map(buildNode);
}

function groupAccuracyByDifficulty(
  attempts: { correct: boolean; question: { difficulty: Difficulty } }[],
): Map<Difficulty, { total: number; correct: number }> {
  const map = new Map<Difficulty, { total: number; correct: number }>();
  for (const a of attempts) {
    const entry = map.get(a.question.difficulty) ?? { total: 0, correct: 0 };
    entry.total += 1;
    if (a.correct) entry.correct += 1;
    map.set(a.question.difficulty, entry);
  }
  return map;
}

function groupSessionsByScenario(sessions: LabSessionWithScore[]): Map<string, LabSessionWithScore[]> {
  const map = new Map<string, LabSessionWithScore[]>();
  for (const s of sessions) {
    const arr = map.get(s.scenarioId) ?? [];
    arr.push(s);
    map.set(s.scenarioId, arr);
  }
  return map;
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

  const allScenarioIds = [...new Set(nodes.flatMap((n) => n.labLinks.map((l) => l.scenarioId)))];
  const sessions =
    allScenarioIds.length > 0
      ? await db.labSession.findMany({
          where: { userId, scenarioId: { in: allScenarioIds } },
          include: { submission: true },
        })
      : [];

  return buildRoadmapTree(nodes, groupAccuracyByDifficulty(attempts), groupSessionsByScenario(sessions));
}

export interface TopicProgressSummary {
  topic: { id: string; slug: string; name: string };
  total: number;
  mastered: number;
  generated: boolean;
}

/**
 * Tiến độ mọi chủ đề cho 1 user, trong một lượt fetch gộp (không N round-trip theo số chủ đề)
 * — chỉ tính chủ đề đã có roadmap, không tự sinh LLM ở đây (sinh roadmap xảy ra ở trang chi
 * tiết `/roadmap/[topicSlug]`, tránh gọi LLM hàng loạt khi chỉ xem trang tổng quan).
 */
export async function getAllTopicsProgress(userId: string): Promise<TopicProgressSummary[]> {
  const [topics, nodes, attempts] = await Promise.all([
    db.topic.findMany({ orderBy: { order: "asc" } }),
    db.skillNode.findMany({ include: { labLinks: true }, orderBy: { order: "asc" } }),
    db.quizAttempt.findMany({
      where: { userId },
      select: { correct: true, question: { select: { topicId: true, difficulty: true } } },
    }),
  ]);

  const nodesByTopic = groupBy(nodes, (n) => n.topicId);
  const allScenarioIds = [...new Set(nodes.flatMap((n) => n.labLinks.map((l) => l.scenarioId)))];
  const sessions =
    allScenarioIds.length > 0
      ? await db.labSession.findMany({
          where: { userId, scenarioId: { in: allScenarioIds } },
          include: { submission: true },
        })
      : [];
  const sessionsByScenario = groupSessionsByScenario(sessions);

  return topics.map((topic) => {
    const topicNodes = nodesByTopic.get(topic.id) ?? [];
    if (topicNodes.length === 0) return { topic, total: 0, mastered: 0, generated: false };

    const topicAttempts = attempts.filter((a) => a.question.topicId === topic.id);
    const roadmap = buildRoadmapTree(topicNodes, groupAccuracyByDifficulty(topicAttempts), sessionsByScenario);
    const { total, mastered } = countMasteredLeaves(roadmap);
    return { topic, total, mastered, generated: true };
  });
}

export interface TeamMemberProgress {
  user: { id: string; name: string; email: string };
  total: number;
  mastered: number;
}

/**
 * Tiến độ tổng (mọi chủ đề, mọi user) cho trang /team — fetch gộp theo hằng số lượt query
 * (không nhân theo số user) để tránh dồn quá nhiều query đồng thời khi team đông người.
 */
export async function getTeamProgress(): Promise<TeamMemberProgress[]> {
  const [users, nodes, attempts] = await Promise.all([
    db.user.findMany({ orderBy: { name: "asc" } }),
    db.skillNode.findMany({ include: { labLinks: true }, orderBy: { order: "asc" } }),
    db.quizAttempt.findMany({
      select: { userId: true, correct: true, question: { select: { topicId: true, difficulty: true } } },
    }),
  ]);

  const nodesByTopic = groupBy(nodes, (n) => n.topicId);
  const allScenarioIds = [...new Set(nodes.flatMap((n) => n.labLinks.map((l) => l.scenarioId)))];
  const sessions =
    allScenarioIds.length > 0
      ? await db.labSession.findMany({
          where: { scenarioId: { in: allScenarioIds } },
          include: { submission: true },
        })
      : [];

  return users.map((user) => {
    const userAttempts = attempts.filter((a) => a.userId === user.id);
    const userSessions = sessions.filter((s) => s.userId === user.id);
    const sessionsByScenario = groupSessionsByScenario(userSessions);

    let total = 0;
    let mastered = 0;
    for (const topicNodes of nodesByTopic.values()) {
      const topicAttempts = userAttempts.filter((a) => a.question.topicId === topicNodes[0].topicId);
      const roadmap = buildRoadmapTree(
        topicNodes,
        groupAccuracyByDifficulty(topicAttempts),
        sessionsByScenario,
      );
      const counted = countMasteredLeaves(roadmap);
      total += counted.total;
      mastered += counted.mastered;
    }

    return { user, total, mastered };
  });
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const arr = map.get(key) ?? [];
    arr.push(item);
    map.set(key, arr);
  }
  return map;
}
