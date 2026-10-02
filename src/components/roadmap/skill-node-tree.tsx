import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { RoadmapNode } from "@/lib/roadmap/progress";
import type { NodeStatus } from "@/lib/roadmap/nodeStatus";

const STATUS_LABEL: Record<NodeStatus, string> = {
  NOT_STARTED: "Chưa bắt đầu",
  IN_PROGRESS: "Đang học",
  MASTERED: "Đã thành thạo",
};

const STATUS_VARIANT: Record<NodeStatus, "secondary" | "default" | "outline"> = {
  NOT_STARTED: "outline",
  IN_PROGRESS: "secondary",
  MASTERED: "default",
};

export function SkillNodeTree({ nodes, topicSlug }: { nodes: RoadmapNode[]; topicSlug: string }) {
  return (
    <ul className="flex flex-col gap-3">
      {nodes.map((node) => (
        <li key={node.id}>
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-2">
              <div>
                <CardTitle className="text-base">{node.title}</CardTitle>
                {node.description ? <CardDescription>{node.description}</CardDescription> : null}
              </div>
              <Badge variant={STATUS_VARIANT[node.status]}>{STATUS_LABEL[node.status]}</Badge>
            </CardHeader>
            {node.difficulty ? (
              <CardContent className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href={`/quiz/session?topicSlug=${topicSlug}&difficulty=${node.difficulty}&count=10`}>
                    Luyện quiz
                  </Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/lab?topicSlug=${topicSlug}&difficulty=${node.difficulty}`}>Vào lab</Link>
                </Button>
              </CardContent>
            ) : null}
          </Card>
          {node.children.length > 0 ? (
            <div className="mt-3 ml-6 border-l pl-4">
              <SkillNodeTree nodes={node.children} topicSlug={topicSlug} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
