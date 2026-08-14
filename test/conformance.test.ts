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
  "datalog__constraint-set-with-a-fact-and-a-rule.flix",
  "datalog__guard-and-functional-body-predicates.flix",
  "datalog__inject-into-predicates-with-arity.flix",
  "datalog__inject-several-relations.flix",
  "datalog__lattice-terms-use-a-semicolon-tail.flix",
  "datalog__negation-and-fix-in-a-body-atom.flix",
  "datalog__negation-is-visible-in-the-tree.flix",
  "datalog__query-piped-into-a-function.flix",
  "datalog__query-with-select-and-from.flix",
  "datalog__schema-type.flix",
  "datalog__solve-and-project.flix",
  "declarations__annotations-precede-modifiers.flix",
  "declarations__enum-case-separators-are-optional.flix",
  "declarations__enum-shorthand-and-derivations.flix",
  "declarations__enum-with-cases.flix",
  "expressions__angled-plus-triple-colon-and-instanceof.flix",
  "expressions__applicative-for.flix",
  "expressions__array-literal-requires-a-region.flix",
  "expressions__backtick-infix-function.flix",
  "expressions__collection-literals.flix",
  "expressions__comparison-operators-and-false.flix",
  "expressions__cons-is-right-associative.flix",
  "expressions__discard-force-lazy.flix",
  "expressions__field-access-chains.flix",
  "expressions__for-comprehensions.flix",
  "expressions__handler.flix",
  "expressions__if-then-else.flix",
  "expressions__intrinsic-and-static-region.flix",
  "expressions__let-and-sequencing.flix",
  "expressions__local-def.flix",
  "expressions__match-with-guard.flix",
  "expressions__math-name-operator.flix",
  "expressions__monadic-and-applicative-for.flix",
  "expressions__null-literal.flix",
  "expressions__operator-as-lambda.flix",
  "expressions__operator-precedence.flix",
  "expressions__qualified-names-stop-at-the-first-lowercase-segm.flix",
  "expressions__record-pattern.flix",
  "expressions__restrictable-choose.flix",
  "expressions__spawn-and-par.flix",
  "expressions__struct-access-and-update.flix",
  "expressions__struct-field-assignment-and-indexed-assignment.flix",
  "expressions__struct-field-assignment.flix",
  "expressions__try-catch.flix",
  "expressions__use-inside-an-expression.flix",
  "lexical__bang-and-dollar-are-name-characters.flix",
  "lexical__char-regex-and-escapes.flix",
  "lexical__exponent-may-carry-a-fraction.flix",
  "lexical__law-and-lawful-are-names.flix",
  "lexical__multi-character-user-operators.flix",
  "lexical__nested-string-interpolation.flix",
  "lexical__numeric-literals.flix",
  "lexical__string-interpolation.flix",
  "named-arguments.flix",
  "types__case-set-type.flix",
  "types__extensible-schema-type.flix",
  "types__schema-row-type.flix",
  "types__tuple-and-unit-types.flix",
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
