/**
 * Map domain của knowledge/ (9 domain, xem knowledge/_taxonomy.yaml) sang Topic.slug của app
 * (7 topic gốc + "data"/"sre" thêm khi import knowledge base — xem prisma/seed.ts).
 * Domain không có mặt ở đây bị kb:build-quiz bỏ qua (coi là chưa map).
 */
export const DOMAIN_TO_TOPIC_SLUG: Record<string, string> = {
  linux: "linux",
  networking: "networking",
  "virt-storage": "virtualization",
  "container-k8s": "container",
  monitoring: "monitoring-logging",
  devops: "cicd-iac",
  security: "security-hardening",
  data: "data",
  sre: "sre",
};
