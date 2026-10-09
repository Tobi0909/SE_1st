-- CreateTable
CREATE TABLE "lab_scenario_flags" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_scenario_flags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_scenario_flags_scenarioId_idx" ON "lab_scenario_flags"("scenarioId");

-- CreateIndex
CREATE INDEX "lab_scenario_flags_resolved_idx" ON "lab_scenario_flags"("resolved");

-- AddForeignKey
ALTER TABLE "lab_scenario_flags" ADD CONSTRAINT "lab_scenario_flags_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "lab_scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_scenario_flags" ADD CONSTRAINT "lab_scenario_flags_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
