"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/rbac";

export async function resolveFlagAction(questionId: string): Promise<void> {
  await requireAdmin();
  await db.question.update({ where: { id: questionId }, data: { status: "ACTIVE" } });
  await db.questionFlag.updateMany({
    where: { questionId, resolved: false },
    data: { resolved: true },
  });
  revalidatePath("/admin/flagged");
}

export async function hideQuestionAction(questionId: string): Promise<void> {
  await requireAdmin();
  await db.question.update({ where: { id: questionId }, data: { status: "HIDDEN" } });
  await db.questionFlag.updateMany({
    where: { questionId, resolved: false },
    data: { resolved: true },
  });
  revalidatePath("/admin/flagged");
}

export async function resolveLabFlagAction(scenarioId: string): Promise<void> {
  await requireAdmin();
  await db.labScenario.update({ where: { id: scenarioId }, data: { status: "ACTIVE" } });
  await db.labScenarioFlag.updateMany({
    where: { scenarioId, resolved: false },
    data: { resolved: true },
  });
  revalidatePath("/admin/flagged");
}

export async function hideLabScenarioAction(scenarioId: string): Promise<void> {
  await requireAdmin();
  await db.labScenario.update({ where: { id: scenarioId }, data: { status: "HIDDEN" } });
  await db.labScenarioFlag.updateMany({
    where: { scenarioId, resolved: false },
    data: { resolved: true },
  });
  revalidatePath("/admin/flagged");
}
