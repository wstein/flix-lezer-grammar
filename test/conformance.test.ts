import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { project } from "../src/projection.js";
import { expectedTree, firstDifference, normalize } from "./helpers/conformance.js";
import { positiveFixtures, tokenKinds } from "./helpers/spec.js";

const TOKENS = new Set(tokenKinds());

/**
 * Fixtures whose projected tree already equals the reference's, node for node. Listed rather than
 * counted so that a fix and a regression cannot cancel out.
 */
const MATCHING = [
  "declarations__enum-case-separators-are-optional.flix",
  "declarations__enum-shorthand-and-derivations.flix",
  "declarations__enum-with-cases.flix",
];

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

  const matching = results.filter((r) => !r.diff);

  // A ratchet, not a target. The oracle lane is the thing this repository exists to pass, and the
  // count only ever moves up: raise it when a fix lands, and a regression that unmatches a fixture
  // fails here. The remaining differences are dominated by `Expr.Expr`, which is an open question
  // for flix-spec rather than a defect here — see docs/CONFORMANCE.md.
  it("matches the reference tree for at least the fixtures it already matched", () => {
    writeFileSync(
      "/tmp/oracle-lane.json",
      JSON.stringify({ total: results.length, failing: results.filter((r) => r.diff) }, null, 2),
    );
    expect(matching.map((r) => r.name).sort()).toEqual(MATCHING.slice().sort());
  });
});
