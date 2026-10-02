"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

const CreateTopicSchema = z.object({
  slug: z
    .string()
    .min(1, "Slug không được để trống")
    .regex(/^[a-z0-9-]+$/, "Slug chỉ gồm chữ thường, số và dấu gạch ngang"),
  name: z.string().min(1, "Tên không được để trống"),
  description: z.string().optional(),
  order: z.coerce.number().int().optional(),
});

export async function createTopicAction(
  _prevState: string | undefined,
  formData: FormData,
): Promise<string | undefined> {
  await requireAdmin();

  const parsed = CreateTopicSchema.safeParse({
    slug: formData.get("slug"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    order: formData.get("order") || undefined,
  });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ";

  const existing = await db.topic.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) return "Slug đã tồn tại";

  await db.topic.create({
    data: {
      slug: parsed.data.slug,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      order: parsed.data.order ?? 0,
    },
  });

  revalidatePath("/admin/topics");
  return undefined;
}

const UpdateTopicSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  order: z.coerce.number().int(),
});

export async function updateTopicAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const parsed = UpdateTopicSchema.parse({
    id: formData.get("id"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    order: formData.get("order"),
  });

  await db.topic.update({
    where: { id: parsed.id },
    data: { name: parsed.name, description: parsed.description ?? null, order: parsed.order },
  });

  revalidatePath("/admin/topics");
}
