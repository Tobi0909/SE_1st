import { notFound } from "next/navigation";

import { LabWorkspace } from "@/components/lab/lab-workspace";
import { db } from "@/lib/db";
import { getArticlesForTopic } from "@/lib/knowledge/queries";
import { LabScenarioSchema, SubmissionGradeSchema } from "@/lib/llm/schemas";
import { requireUser } from "@/lib/rbac";

export default async function LabSessionPage({ params }: PageProps<"/lab/[sessionId]">) {
  const user = await requireUser();
  const { sessionId } = await params;

  const session = await db.labSession.findUnique({
    where: { id: sessionId },
    include: {
      scenario: true,
      commandLogs: { orderBy: { createdAt: "asc" } },
      hints: true,
      submission: true,
    },
  });
  if (!session || session.userId !== user.id) notFound();

  const scenario = LabScenarioSchema.parse(session.scenario.data);
  const usedHintLevels = [...new Set(session.hints.map((h) => h.level))].sort();

  const topic = await db.topic.findUnique({
    where: { id: session.scenario.topicId },
    select: { slug: true },
  });
  const relatedArticles = topic
    ? await getArticlesForTopic(topic.slug, session.scenario.difficulty)
    : [];

  return (
    <LabWorkspace
      sessionId={session.id}
      title={scenario.title}
      briefing={scenario.briefing}
      commandHistory={session.commandLogs.map((l) => ({ command: l.command, output: l.output }))}
      usedHintLevels={usedHintLevels}
      isCompleted={session.status === "COMPLETED"}
      grade={session.submission ? SubmissionGradeSchema.parse(session.submission.score) : null}
      relatedArticles={relatedArticles.map((a) => ({ knowledgeId: a.knowledgeId, title: a.title }))}
    />
  );
}
