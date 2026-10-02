import path from "node:path";

import { defineConfig } from "vitest/config";

const rootDir = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@/": `${path.resolve(rootDir, "src")}/`,
      "@prompts/": `${path.resolve(rootDir, "prompts")}/`,
    },
  },
  test: {
    environment: "node",
  },
});
