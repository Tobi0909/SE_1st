import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const SAMPLE_TOPICS = [
  { slug: "linux", name: "Linux", description: "Quản trị và troubleshooting hệ thống Linux", order: 1 },
  { slug: "networking", name: "Networking", description: "TCP/IP, routing, DNS, TLS, firewall", order: 2 },
  { slug: "virtualization", name: "Virtualization", description: "VMware, Proxmox", order: 3 },
  { slug: "container", name: "Container", description: "Docker, Kubernetes", order: 4 },
  { slug: "monitoring-logging", name: "Monitoring & Logging", description: "Zabbix, Prometheus, Splunk", order: 5 },
  { slug: "cicd-iac", name: "CI/CD & IaC", description: "CI/CD pipeline và Infrastructure as Code", order: 6 },
  { slug: "security-hardening", name: "Security Hardening", description: "Bảo mật và hardening hệ thống", order: 7 },
];

async function main() {
  const adminEmail = requireEnv("SEED_ADMIN_EMAIL");
  const adminPassword = requireEnv("SEED_ADMIN_PASSWORD");
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  const passwordHash = await hashPassword(adminPassword);

  await db.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      name: adminName,
      role: "ADMIN",
    },
  });
  console.log(`✓ Admin user: ${adminEmail}`);

  for (const topic of SAMPLE_TOPICS) {
    await db.topic.upsert({
      where: { slug: topic.slug },
      update: { name: topic.name, description: topic.description, order: topic.order },
      create: topic,
    });
  }
  console.log(`✓ ${SAMPLE_TOPICS.length} chủ đề mẫu`);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Thiếu biến môi trường ${name}`);
  return value;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
