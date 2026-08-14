#!/usr/bin/env node
// Compiles src/flix.grammar with lezer-generator and reports conflicts. Rollup does the same
// through @lezer/generator/rollup during `npm run build`; this exists so grammar errors can be
// read on their own, without a bundler's framing around them.

import { buildParserFile } from "@lezer/generator";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "src", "flix.grammar");

try {
  const { parser, terms } = buildParserFile(readFileSync(file, "utf8"), {
    fileName: file,
    moduleStyle: "es",
    warn: (message) => console.log(`warning: ${message}`),
  });

  // `src/flix.grammar` and `src/flix.grammar.terms` are virtual: the lezer Rollup plugin creates
  // them at build time, and Vitest loads the same plugin, so both work at runtime. `tsc` runs no
  // bundler and cannot see either. Emitting declarations for them here is what lets `typecheck`
  // cover the sources that import them, without a generated artifact being committed.
  writeFileSync(
    join(root, "src", "flix.grammar.d.ts"),
    'import type { LRParser } from "@lezer/lr";\nexport declare const parser: LRParser;\n',
  );
  // The generated module is one `export const` with every term after it, comma separated.
  const names = [...terms.matchAll(/(\w+)\s*=\s*\d+/g)].map((m) => m[1]);
  writeFileSync(
    join(root, "src", "flix.grammar.terms.d.ts"),
    [...new Set(names)].map((n) => `export declare const ${n}: number;`).join("\n") + "\n",
  );

  console.log(`ok — ${parser.length} bytes of parser module, ${new Set(names).size} terms`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
