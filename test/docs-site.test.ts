import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const typedoc = JSON.parse(readFileSync(resolve("typedoc.json"), "utf8")) as {
  entryPoints: string[];
  out: string;
  projectDocuments: string[];
};

describe("documentation site", () => {
  it("generates the public API and repository guides into the Pages artifact", () => {
    expect(typedoc.entryPoints).toEqual(["src/index.ts"]);
    expect(typedoc.out).toBe("site");
    expect(typedoc.projectDocuments).toEqual(["docs/*.md"]);
  });
});
