import { buildParser } from "@lezer/generator";
import { ExternalTokenizer } from "@lezer/lr";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const grammar = readFileSync(resolve("src/flix.grammar"), "utf8").replace(
  "@top SourceFile { UseOrImportList declaration* }",
  "@top SourceFile { expression }",
);

describe("recursive expression layers", () => {
  it("builds and accepts narrow operands in run and try expressions", () => {
    const parser = buildParser(grammar, {
      fileName: "src/flix.grammar",
      externalTokenizer: () => new ExternalTokenizer(() => {}),
    });

    for (const source of ["run f with g", "try f"]) {
      expect(parser.parse(source).toString(), source).not.toContain("⚠");
    }
  }, 120_000);
});
