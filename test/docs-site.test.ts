import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const typedoc = JSON.parse(readFileSync(resolve("typedoc.json"), "utf8")) as {
  entryPoints: string[];
  out: string;
  projectDocuments: string[];
};
const workflow = readFileSync(resolve(".github/workflows/docs.yml"), "utf8");

describe("documentation site", () => {
  it("generates the public API and repository guides into the Pages artifact", () => {
    expect(typedoc.entryPoints).toEqual(["src/index.ts"]);
    expect(typedoc.out).toBe("site");
    expect(typedoc.projectDocuments).toEqual(["docs/*.md"]);
  });

  it("deploys the generated artifact with the official GitHub Pages actions", () => {
    expect(workflow).toContain("npm run docs:build");
    expect(workflow).toContain("path: site");
    expect(workflow).toContain("pages: write");
    expect(workflow).toContain("id-token: write");
    expect(workflow).toContain("actions/deploy-pages@");
  });
});
