import { notFound } from "next/navigation";

import { SkillNodeTree } from "@/components/roadmap/skill-node-tree";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/rbac";
import { computeTopicRoadmap, ensureSkillTree } from "@/lib/roadmap/progress";

export default async function RoadmapTopicPage({ params }: PageProps<"/roadmap/[topicSlug]">) {
  const user = await requireUser();
  const { topicSlug } = await params;

  const topic = await db.topic.findUnique({ where: { slug: topicSlug } });
  if (!topic) notFound();

  await ensureSkillTree(topic.id, user.id);
  const roadmap = await computeTopicRoadmap(user.id, topic.id);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{topic.name}</h1>
        {topic.description ? <p className="text-sm text-muted-foreground">{topic.description}</p> : null}
      </div>
      <SkillNodeTree nodes={roadmap} topicSlug={topic.slug} />
    </div>
  );
}
