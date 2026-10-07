import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen } from "lucide-react";

import { SkillNodeTree } from "@/components/roadmap/skill-node-tree";
import { db } from "@/lib/db";
import { getArticles } from "@/lib/knowledge/queries";
import { requireUser } from "@/lib/rbac";
import { computeTopicRoadmap, ensureSkillTree } from "@/lib/roadmap/progress";

// Maps topic slug to knowledge domain for "related articles" section
const TOPIC_TO_DOMAIN: Record<string, string> = {
  linux:                "linux",
  networking:           "networking",
  virtualization:       "virt-storage",
  container:            "container-k8s",
  "monitoring-logging": "monitoring",
  "cicd-iac":           "devops",
  "security-hardening": "security",
  sre:                  "sre",
  data:                 "data",
};

export default async function RoadmapTopicPage({ params }: PageProps<"/roadmap/[topicSlug]">) {
  const user = await requireUser();
  const { topicSlug } = await params;

  const topic = await db.topic.findUnique({ where: { slug: topicSlug } });
  if (!topic) notFound();

  const domain = TOPIC_TO_DOMAIN[topic.slug];
  const [roadmap, articleResult] = await Promise.all([
    ensureSkillTree(topic.id, user.id).then(() => computeTopicRoadmap(user.id, topic.id)),
    domain
      ? getArticles({ domain, isAdmin: user.role === "ADMIN", pageSize: 50 })
      : Promise.resolve({ items: [], total: 0 }),
  ]);

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{topic.name}</h1>
        {topic.description ? <p className="text-sm text-muted-foreground">{topic.description}</p> : null}
      </div>
      <SkillNodeTree nodes={roadmap} topicSlug={topic.slug} />

      {articleResult.items.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            <BookOpen className="size-4" /> Tài liệu tham khảo ({articleResult.total})
          </p>
          <ul className="flex flex-col gap-1">
            {articleResult.items.map((a) => (
              <li key={a.knowledgeId}>
                <Link
                  href={`/knowledge/${encodeURIComponent(a.knowledgeId)}`}
                  className="text-sm text-primary hover:underline"
                >
                  {a.title}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">
                  {a.level === "FOUNDATION" ? "Nền tảng" : a.level === "OPERATION" ? "Vận hành" : "Chuyên sâu"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
