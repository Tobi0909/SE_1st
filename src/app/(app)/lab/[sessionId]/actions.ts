"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/lib/db";
import type { SessionState } from "@/lib/lab/sessionState";
import { resolveCommand } from "@/lib/lab/runCommand";
import { getLLMProvider } from "@/lib/llm/provider";
import { LabScenarioSchema, type SubmissionGrade } from "@/lib/llm/schemas";
import { ForbiddenError, requireUser } from "@/lib/rbac";

async function loadOwnedSession(sessionId: string, userId: string) {
  const session = await db.labSession.findUniqueOrThrow({
    where: { id: sessionId },
    include: { scenario: true },
  });
  if (session.userId !== userId) throw new ForbiddenError();
  return session;
}

export async function runCommandAction(sessionId: string, rawCommand: string): Promise<string> {
  const user = await requireUser();
  const session = await loadOwnedSession(sessionId, user.id);

  if (session.status !== "IN_PROGRESS") {
    return "(Phiên đã kết thúc, không thể chạy thêm lệnh. Bắt đầu lab mới để tiếp tục luyện tập.)";
  }

  const scenario = LabScenarioSchema.parse(session.scenario.data);
  const state = session.state as unknown as SessionState;

  const recentLogs = await db.labCommandLog.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const result = await resolveCommand({
    scenario,
    scenarioId: session.scenarioId,
    state,
    commandHistory: recentLogs.reverse().map((l) => ({ command: l.command, output: l.output })),
    rawCommand,
    userId: user.id,
  });

  await db.labCommandLog.create({
    data: { sessionId, command: rawCommand, output: result.output, source: result.source },
  });
  await db.labSession.update({
    where: { id: sessionId },
    data: { state: JSON.parse(JSON.stringify(result.newState)) },
  });

  return result.output;
}

export async function getHintAction(sessionId: string, level: number): Promise<string> {
  const user = await requireUser();
  const session = await loadOwnedSession(sessionId, user.id);

  if (level < 1 || level > 3) throw new Error("level phải từ 1 đến 3");

  const scenario = LabScenarioSchema.parse(session.scenario.data);
  await db.labHintUsage.create({ data: { sessionId, level } });

  return scenario.hints[level - 1];
}

export async function submitLabAction(
  sessionId: string,
  rootCauseText: string,
  fixText: string,
): Promise<SubmissionGrade> {
  const user = await requireUser();
  const session = await loadOwnedSession(sessionId, user.id);

  if (session.status !== "IN_PROGRESS") {
    throw new Error("Phiên này đã nộp bài rồi");
  }

  const scenario = LabScenarioSchema.parse(session.scenario.data);
  const provider = await getLLMProvider();
  const grade = await provider.gradeSubmission({
    userId: user.id,
    scenario,
    rootCauseText,
    fixText,
  });

  await db.labSubmission.create({
    data: {
      sessionId,
      rootCauseText,
      fixText,
      score: JSON.parse(JSON.stringify(grade)),
      feedback: grade.feedback,
    },
  });
  await db.labSession.update({
    where: { id: sessionId },
    data: { status: "COMPLETED", submittedAt: new Date() },
  });

  revalidatePath(`/lab/${sessionId}`);
  return grade;
}

export async function flagLabScenarioAction(sessionId: string, reason: string): Promise<void> {
  const user = await requireUser();
  const session = await loadOwnedSession(sessionId, user.id);

  await db.labScenarioFlag.create({
    data: { scenarioId: session.scenarioId, userId: user.id, reason: reason || null },
  });
  await db.labScenario.update({ where: { id: session.scenarioId }, data: { status: "FLAGGED" } });
  revalidatePath("/admin/flagged");
}
