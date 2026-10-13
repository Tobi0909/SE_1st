import { linuxScenarios } from "./linux";
import { networkingScenarios } from "./networking";
import { virtualizationScenarios } from "./virtualization";
import { containerScenarios } from "./container";
import { monitoringScenarios } from "./monitoring";
import { cicdScenarios } from "./cicd";
import { securityScenarios } from "./security";
import { dataScenarios } from "./data";
import { sreScenarios } from "./sre";

/** 81 lab mẫu viết tay (9 chủ đề x 3 độ khó x 3 biến thể) — xem scripts/seed-lab-scenarios.ts. */
export const ALL_STATIC_LAB_SCENARIOS = [
  ...linuxScenarios,
  ...networkingScenarios,
  ...virtualizationScenarios,
  ...containerScenarios,
  ...monitoringScenarios,
  ...cicdScenarios,
  ...securityScenarios,
  ...dataScenarios,
  ...sreScenarios,
];
