"use server";

import { redirect } from "next/navigation";

import type { Difficulty } from "@/generated/prisma/client";
import { buildInitialSessionState } from "@/lib/lab/sessionState";
import { ensureLabScenario, pickRandomLabScenario } from "@/lib/lab/scenarioPool";
import { db } from "@/lib/db";
import { LabScenarioSchema } from "@/lib/llm/schemas";
import { requireUser } from "@/lib/rbac";

const DIFFICULTIES: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

export async function startLabAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const topicSlug = String(formData.get("topicSlug") ?? "");
  const difficultyRaw = String(formData.get("difficulty") ?? "");
  if (!DIFFICULTIES.includes(difficultyRaw as Difficulty)) {
    throw new Error("Độ khó không hợp lệ");
  }
  const difficulty = difficultyRaw as Difficulty;

  const topic = await db.topic.findUniqueOrThrow({ where: { slug: topicSlug } });

  await ensureLabScenario(topic.id, difficulty, user.id);
  const scenario = await pickRandomLabScenario(topic.id, difficulty);
  if (!scenario) throw new Error("Không tạo được scenario cho chủ đề/độ khó này");

  const scenarioData = LabScenarioSchema.parse(scenario.data);
  const initialState = buildInitialSessionState(scenarioData);

  const session = await db.labSession.create({
    data: {
      userId: user.id,
      scenarioId: scenario.id,
      state: JSON.parse(JSON.stringify(initialState)),
      status: "IN_PROGRESS",
    },
  });

  redirect(`/lab/${session.id}`);
}
