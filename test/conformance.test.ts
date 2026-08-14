import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { project } from "../src/projection.js";
import { expectedTree, firstDifference, normalize } from "./helpers/conformance.js";
import { positiveFixtures, tokenKinds } from "./helpers/spec.js";

const TOKENS = new Set(tokenKinds());

/**
 * Fixtures whose projected tree deliberately differs from the reference's, with the reason. Every
 * other fixture must match node for node, so this list is the whole of what is not claimed: an
 * unlisted fixture that starts differing fails here, and a listed one that starts matching fails
 * too and has to be taken off.
 */
const ACCEPTED_DIVERGENCES = new Map<string, string>([
  [
    "lexical__line-and-doc-comments.flix",
    "Parser2.open() takes a run of comments at the node it is opening, so the reference splits one " +
      "run across two CommentLists at a declaration boundary. Comments are @skip tokens here and " +
      "Lezer attaches every one of them to the node the run started in, so the split point is not " +
      "information this tree carries. See docs/CONFORMANCE.md.",
  ],
]);

/**
 * The oracle lane, run locally. `flix-spec` owns the official comparison; this reproduces it from
 * the same inputs so a structural regression is visible in the same session that causes it.
 */
function compare(name: string, source: string): string | null {
  const raw = project(source, { tokenKinds: TOKENS, path: name }).tree;
  const ours = normalize(raw);
  if (ours.length !== 1) return `normalisation produced ${ours.length} roots`;
  const diff = firstDifference(expectedTree(name), ours[0]);
  return diff ? `${diff.path || "/"}: expected ${diff.expected}, got ${diff.actual}` : null;
}

describe("oracle lane", () => {
  const fixtures = positiveFixtures().filter((f) => {
    try {
      expectedTree(f.name);
      return true;
    } catch {
      return false;
    }
  });

  it("has reference trees to compare against", () => {
    expect(fixtures.length).toBeGreaterThan(100);
  });

  const results = fixtures.map(({ name, source }) => {
    try {
      return { name, diff: compare(name, source) };
    } catch (error) {
      return { name, diff: `threw: ${error instanceof Error ? error.message : String(error)}` };
    }
  });

  it("matches the reference tree for every fixture but the accepted divergences", () => {
    // Every difference in this lane was diagnosed from this report, so the capability stays — but
    // behind a variable rather than writing a fixed shared path on every run, where two runs at
    // once would overwrite each other and nothing in the suite reads the result anyway.
    const report = process.env.ORACLE_LANE_REPORT;
    if (report) {
      writeFileSync(
        report,
        JSON.stringify({ total: results.length, failing: results.filter((r) => r.diff) }, null, 2),
      );
    }
    const differing = results
      .filter((r) => r.diff)
      .map((r) => r.name)
      .sort();
    expect(differing).toEqual([...ACCEPTED_DIVERGENCES.keys()].sort());
  });
});
