import { z } from "zod";

export const DifficultySchema = z.enum(["EASY", "MEDIUM", "HARD"]);

export const QuizOptionSchema = z.object({
  text: z.string().min(1),
  isCorrect: z.boolean(),
  explanation: z.string().min(1),
});

export const QuizQuestionSchema = z
  .object({
    stem: z.string().min(1),
    options: z.array(QuizOptionSchema).min(2),
  })
  .refine(
    (q) => q.options.filter((o) => o.isCorrect).length === 1,
    { message: "Mỗi câu hỏi phải có đúng một đáp án đúng" },
  );

export const QuizBatchSchema = z.object({
  questions: z.array(QuizQuestionSchema).min(1),
});
export type QuizBatch = z.infer<typeof QuizBatchSchema>;

export const VirtualFsNodeSchema: z.ZodType<VirtualFsNode> = z.lazy(() =>
  z.object({
    name: z.string().min(1),
    type: z.enum(["file", "dir"]),
    content: z.string().optional(),
    children: z.array(VirtualFsNodeSchema).optional(),
  }),
);
export interface VirtualFsNode {
  name: string;
  type: "file" | "dir";
  content?: string;
  children?: VirtualFsNode[];
}

export const VirtualServiceSchema = z.object({
  name: z.string().min(1),
  status: z.enum(["running", "stopped", "failed"]),
  port: z.number().int().optional(),
  configPath: z.string().optional(),
});

export const StatePatchOpSchema = z.object({
  op: z.enum(["set", "remove", "append"]),
  path: z.string().min(1),
  value: z.unknown().optional(),
});
export type StatePatchOp = z.infer<typeof StatePatchOpSchema>;

export const PresetCommandSchema = z.object({
  match: z.object({
    type: z.enum(["exact", "startsWith", "regex"]),
    pattern: z.string().min(1),
  }),
  output: z.string(),
  stateEffect: z
    .object({
      description: z.string(),
      patch: z.array(StatePatchOpSchema),
    })
    .optional(),
});

export const LabScenarioSchema = z.object({
  version: z.literal(1),
  title: z.string().min(1),
  topicSlug: z.string().min(1),
  difficulty: DifficultySchema,
  briefing: z.object({
    context: z.string().min(1),
    symptoms: z.array(z.string().min(1)).min(1),
  }),
  hiddenState: z.object({
    filesystem: z.array(VirtualFsNodeSchema),
    services: z.array(VirtualServiceSchema),
    logs: z.record(z.string(), z.array(z.string())),
  }),
  rootCause: z.object({
    summary: z.string().min(1),
    explanation: z.string().min(1),
  }),
  completionCriteria: z.object({
    requiredFindings: z.array(z.string().min(1)).min(1),
    rubric: z
      .array(z.object({ criterion: z.string().min(1), weight: z.number().positive() }))
      .min(1),
  }),
  presetCommands: z.array(PresetCommandSchema),
  hints: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
});
export type LabScenario = z.infer<typeof LabScenarioSchema>;

export const TerminalOutputSchema = z.object({
  output: z.string(),
  stateEffect: z
    .object({
      description: z.string(),
      patch: z.array(StatePatchOpSchema),
    })
    .optional(),
});
export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;

export const SubmissionGradeSchema = z.object({
  total: z.number().min(0).max(100),
  byRubricItem: z.array(
    z.object({
      criterion: z.string().min(1),
      weight: z.number().positive(),
      met: z.boolean(),
      feedback: z.string().min(1),
    }),
  ),
  feedback: z.string().min(1),
});
export type SubmissionGrade = z.infer<typeof SubmissionGradeSchema>;

export const EssayGradeSchema = z.object({
  score: z.number().min(0).max(100),
  missingPoints: z.array(z.string().min(1)),
  feedback: z.string().min(1),
});
export type EssayGrade = z.infer<typeof EssayGradeSchema>;

export interface SkillTreeNode {
  title: string;
  description: string;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  children?: SkillTreeNode[];
}

export const SkillTreeNodeSchema: z.ZodType<SkillTreeNode> = z.lazy(() =>
  z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    difficulty: DifficultySchema.optional(),
    children: z.array(SkillTreeNodeSchema).optional(),
  }),
);

export const SkillTreeSchema = z.object({
  nodes: z.array(SkillTreeNodeSchema).min(1),
});
export type SkillTree = z.infer<typeof SkillTreeSchema>;
