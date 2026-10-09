"use server";

import { createHash } from "crypto";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { ArticleLevel } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { requireAdmin, requireUser } from "@/lib/rbac";

export async function verifyArticleAction(articleId: string): Promise<void> {
  await requireAdmin();
  await db.article.update({
    where: { id: articleId },
    data: { status: "VERIFIED", lastVerified: new Date() },
  });
  revalidatePath("/knowledge");
}

const SubmitArticleSchema = z.object({
  title: z.string().min(1, "Thiếu tiêu đề"),
  domain: z.string().min(1, "Thiếu lĩnh vực"),
  module: z.string().min(1, "Thiếu module"),
  level: z.enum(["FOUNDATION", "OPERATION", "EXPERT"]),
  content: z.string().min(1, "Thiếu nội dung"),
  sources: z.string().optional(),
});

function slugify(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export async function submitArticleAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  const user = await requireUser();

  const parsed = SubmitArticleSchema.safeParse({
    title: formData.get("title"),
    domain: formData.get("domain"),
    module: formData.get("module"),
    level: formData.get("level"),
    content: formData.get("content"),
    sources: formData.get("sources") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ";

  const { title, domain, module, level, content, sources } = parsed.data;
  const sourceList = (sources ?? "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  const knowledgeId = `upload.${slugify(title)}-${Date.now().toString(36)}`;

  await db.article.create({
    data: {
      knowledgeId,
      title,
      domain,
      module,
      level: level as ArticleLevel,
      status: "DRAFT",
      sourcePath: `(nộp qua app bởi ${user.name})`,
      contentHash: createHash("sha256").update(content).digest("hex"),
      content,
      prerequisites: [],
      appliesTo: [],
      sources: sourceList,
      submittedBy: user.id,
    },
  });

  revalidatePath("/knowledge");
  redirect(`/knowledge/${encodeURIComponent(knowledgeId)}`);
}
