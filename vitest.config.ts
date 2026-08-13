import { lezer } from "@lezer/generator/rollup";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Lets tests import `src/flix.grammar` directly, exactly as the Rollup build does, so they
  // exercise the parser that ships rather than a variant rebuilt for the test.
  plugins: [lezer()],
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 300_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text", "lcov"],
    },
  },
});
