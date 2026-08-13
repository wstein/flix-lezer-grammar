#!/usr/bin/env node
// Compiles src/flix.grammar with lezer-generator and reports conflicts. Rollup does the same
// through @lezer/generator/rollup during `npm run build`; this exists so grammar errors can be
// read on their own, without a bundler's framing around them.

import { buildParserFile } from "@lezer/generator";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "src", "flix.grammar");

try {
  const { parser } = buildParserFile(readFileSync(file, "utf8"), {
    fileName: file,
    moduleStyle: "es",
    warn: (message) => console.log(`warning: ${message}`),
  });
  console.log(`ok — ${parser.length} bytes of parser module`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
