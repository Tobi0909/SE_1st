-- AlterEnum
ALTER TYPE "QuestionStatus" ADD VALUE 'STALE';

-- AlterTable
ALTER TABLE "questions" ADD COLUMN "sourceArticleId" TEXT,
ADD COLUMN "questionIndex" INTEGER,
ADD COLUMN "articleVersion" TEXT;

-- CreateIndex
CREATE INDEX "questions_sourceArticleId_questionIndex_idx" ON "questions"("sourceArticleId", "questionIndex");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_sourceArticleId_fkey" FOREIGN KEY ("sourceArticleId") REFERENCES "articles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
