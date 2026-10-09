-- AlterTable
ALTER TABLE "articles" ADD COLUMN "submittedBy" TEXT;

-- CreateIndex
CREATE INDEX "articles_submittedBy_idx" ON "articles"("submittedBy");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
