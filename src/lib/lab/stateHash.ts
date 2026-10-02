import { createHash } from "node:crypto";

export function hashState(state: unknown): string {
  return createHash("sha256").update(stableStringify(state)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  const entries = Object.keys(value as Record<string, unknown>).sort();
  const body = entries
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",");
  return `{${body}}`;
}
