-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "QuestionSource" AS ENUM ('LLM', 'ADMIN');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('ACTIVE', 'FLAGGED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "ChatContextType" AS ENUM ('NODE', 'QUESTION', 'LAB');

-- CreateEnum
CREATE TYPE "CommandSource" AS ENUM ('PRESET', 'LLM');

-- CreateEnum
CREATE TYPE "LabSessionStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ChatRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "topics" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "stem" TEXT NOT NULL,
    "source" "QuestionSource" NOT NULL DEFAULT 'ADMIN',
    "status" "QuestionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "isCorrect" BOOLEAN NOT NULL,
    "explanation" TEXT NOT NULL,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_flags" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flashcard_states" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "easeFactor" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "intervalDays" INTEGER NOT NULL DEFAULT 0,
    "repetitions" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReviewedAt" TIMESTAMP(3),

    CONSTRAINT "flashcard_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "selectedOptionId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_nodes" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "parentId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "difficulty" "Difficulty",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_scenarios" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "title" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "status" "QuestionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_scenario_nodes" (
    "nodeId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,

    CONSTRAINT "lab_scenario_nodes_pkey" PRIMARY KEY ("nodeId","scenarioId")
);

-- CreateTable
CREATE TABLE "lab_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "status" "LabSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),

    CONSTRAINT "lab_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_command_logs" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "source" "CommandSource" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_command_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_llm_command_cache" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "commandNorm" TEXT NOT NULL,
    "output" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_llm_command_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_hint_usages" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_hint_usages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_submissions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "rootCauseText" TEXT NOT NULL,
    "fixText" TEXT NOT NULL,
    "score" JSONB NOT NULL,
    "feedback" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contextType" "ChatContextType" NOT NULL,
    "contextId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_messages" (
    "id" TEXT NOT NULL,
    "chatSessionId" TEXT NOT NULL,
    "role" "ChatRole" NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_usage_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "feature" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "topics_slug_key" ON "topics"("slug");

-- CreateIndex
CREATE INDEX "questions_topicId_difficulty_status_idx" ON "questions"("topicId", "difficulty", "status");

-- CreateIndex
CREATE INDEX "question_options_questionId_idx" ON "question_options"("questionId");

-- CreateIndex
CREATE INDEX "question_flags_questionId_idx" ON "question_flags"("questionId");

-- CreateIndex
CREATE INDEX "question_flags_resolved_idx" ON "question_flags"("resolved");

-- CreateIndex
CREATE INDEX "flashcard_states_userId_dueAt_idx" ON "flashcard_states"("userId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "flashcard_states_userId_questionId_key" ON "flashcard_states"("userId", "questionId");

-- CreateIndex
CREATE INDEX "quiz_attempts_userId_createdAt_idx" ON "quiz_attempts"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "quiz_attempts_questionId_idx" ON "quiz_attempts"("questionId");

-- CreateIndex
CREATE INDEX "skill_nodes_topicId_idx" ON "skill_nodes"("topicId");

-- CreateIndex
CREATE INDEX "lab_scenarios_topicId_difficulty_status_idx" ON "lab_scenarios"("topicId", "difficulty", "status");

-- CreateIndex
CREATE INDEX "lab_sessions_userId_scenarioId_idx" ON "lab_sessions"("userId", "scenarioId");

-- CreateIndex
CREATE INDEX "lab_command_logs_sessionId_createdAt_idx" ON "lab_command_logs"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "lab_llm_command_cache_scenarioId_stateHash_commandNorm_key" ON "lab_llm_command_cache"("scenarioId", "stateHash", "commandNorm");

-- CreateIndex
CREATE INDEX "lab_hint_usages_sessionId_idx" ON "lab_hint_usages"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "lab_submissions_sessionId_key" ON "lab_submissions"("sessionId");

-- CreateIndex
CREATE INDEX "chat_sessions_userId_createdAt_idx" ON "chat_sessions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "chat_messages_chatSessionId_createdAt_idx" ON "chat_messages"("chatSessionId", "createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_logs_userId_createdAt_idx" ON "llm_usage_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "llm_usage_logs_feature_createdAt_idx" ON "llm_usage_logs"("feature", "createdAt");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_flags" ADD CONSTRAINT "question_flags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_states" ADD CONSTRAINT "flashcard_states_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flashcard_states" ADD CONSTRAINT "flashcard_states_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_nodes" ADD CONSTRAINT "skill_nodes_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_nodes" ADD CONSTRAINT "skill_nodes_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "skill_nodes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "lab_scenarios" ADD CONSTRAINT "lab_scenarios_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_scenario_nodes" ADD CONSTRAINT "lab_scenario_nodes_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "skill_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_scenario_nodes" ADD CONSTRAINT "lab_scenario_nodes_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "lab_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_sessions" ADD CONSTRAINT "lab_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_sessions" ADD CONSTRAINT "lab_sessions_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "lab_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_command_logs" ADD CONSTRAINT "lab_command_logs_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "lab_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_hint_usages" ADD CONSTRAINT "lab_hint_usages_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "lab_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_submissions" ADD CONSTRAINT "lab_submissions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "lab_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usage_logs" ADD CONSTRAINT "llm_usage_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
