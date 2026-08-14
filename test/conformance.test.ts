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
  "checked-effect-cast.flix",
  "datalog__constraint-set-with-a-fact-and-a-rule.flix",
  "datalog__fixpoint-lambda.flix",
  "datalog__guard-and-functional-body-predicates.flix",
  "datalog__inject-into-predicates-with-arity.flix",
  "datalog__inject-several-relations.flix",
  "datalog__lattice-terms-use-a-semicolon-tail.flix",
  "datalog__negation-and-fix-in-a-body-atom.flix",
  "datalog__negation-is-visible-in-the-tree.flix",
  "datalog__open-schema-type-with-a-row-variable.flix",
  "datalog__provenance-solve-and-query.flix",
  "datalog__query-piped-into-a-function.flix",
  "datalog__query-with-a-where-clause.flix",
  "datalog__query-with-select-and-from.flix",
  "datalog__schema-type.flix",
  "datalog__solve-and-project.flix",
  "declarations__annotations-precede-modifiers.flix",
  "declarations__definitions-may-be-named-by-a-user-defined-opera.flix",
  "declarations__effect-declaration.flix",
  "declarations__enum-case-separators-are-optional.flix",
  "declarations__enum-shorthand-and-derivations.flix",
  "declarations__enum-with-cases.flix",
  "declarations__function-with-equality-constraints.flix",
  "declarations__function-with-type-parameters-and-constraints.flix",
  "declarations__instance-with-redef-and-associated-type-definiti.flix",
  "declarations__module-with-a-function.flix",
  "declarations__restrictable-enum.flix",
  "declarations__sealed-trait.flix",
  "declarations__struct.flix",
  "declarations__trait-with-signature-and-associated-type.flix",
  "declarations__type-alias.flix",
  "declarations__use-with-operator-names.flix",
  "declarations__uses-and-imports.flix",
  "expressions__angled-plus-triple-colon-and-instanceof.flix",
  "expressions__applicative-for.flix",
  "expressions__array-literal-requires-a-region.flix",
  "expressions__ascribe-expression.flix",
  "expressions__backtick-infix-function.flix",
  "expressions__casts.flix",
  "expressions__collection-literals.flix",
  "expressions__comparison-operators-and-false.flix",
  "expressions__cons-and-literal-patterns.flix",
  "expressions__cons-is-right-associative.flix",
  "expressions__discard-force-lazy.flix",
  "expressions__effect-handling-with-run.flix",
  "expressions__ext-match-expression-and-lambda.flix",
  "expressions__extensible-variants.flix",
  "expressions__field-access-chains.flix",
  "expressions__for-comprehensions.flix",
  "expressions__handler.flix",
  "expressions__if-then-else.flix",
  "expressions__indexing.flix",
  "expressions__intrinsic-and-static-region.flix",
  "expressions__java-interop.flix",
  "expressions__java-method-invocation-is-not-a-qualified-name.flix",
  "expressions__lambdas.flix",
  "expressions__let-and-sequencing.flix",
  "expressions__local-def.flix",
  "expressions__match-lambda.flix",
  "expressions__match-with-guard.flix",
  "expressions__math-name-operator.flix",
  "expressions__monadic-and-applicative-for.flix",
  "expressions__null-literal.flix",
  "expressions__operator-as-lambda.flix",
  "expressions__operator-precedence.flix",
  "expressions__qualified-names-stop-at-the-first-lowercase-segm.flix",
  "expressions__record-pattern.flix",
  "expressions__records.flix",
  "expressions__restrictable-choose.flix",
  "expressions__select.flix",
  "expressions__spawn-and-par.flix",
  "expressions__struct-access-and-update.flix",
  "expressions__struct-field-assignment-and-indexed-assignment.flix",
  "expressions__struct-field-assignment.flix",
  "expressions__struct-literal-with-field-initialisers.flix",
  "expressions__super-constructor-and-method.flix",
  "expressions__throw-and-unsafe.flix",
  "expressions__try-catch.flix",
  "expressions__use-inside-an-expression.flix",
  "hello.flix",
  "lexical__bang-and-dollar-are-name-characters.flix",
  "lexical__block-comments-nest.flix",
  "lexical__char-regex-and-escapes.flix",
  "lexical__debug-interpolation.flix",
  "lexical__exponent-may-carry-a-fraction.flix",
  "lexical__four-or-more-slashes-are-line-comments.flix",
  "lexical__holes.flix",
  "lexical__law-and-lawful-are-names.flix",
  "lexical__multi-character-user-operators.flix",
  "lexical__nested-string-interpolation.flix",
  "lexical__numeric-literals.flix",
  "lexical__operators-may-follow-an-arrow.flix",
  "lexical__string-interpolation.flix",
  "named-arguments.flix",
  "restrictable-choose-star.flix",
  "schema-predicate-with-alias.flix",
  "type-kind-ascription.flix",
  "types__arrow-types-are-right-associative.flix",
  "types__case-set-type.flix",
  "types__effect-annotation-binds-to-the-arrow-result.flix",
  "types__effect-sets-and-formulas.flix",
  "types__effect-union-and-complement.flix",
  "types__extensible-schema-type.flix",
  "types__higher-order-kind.flix",
  "types__kind-ascriptions-on-type-parameters.flix",
  "types__pure-and-universal-effects.flix",
  "types__record-row-and-schema-row-types.flix",
  "types__record-types.flix",
  "types__rv-keyword-operators.flix",
  "types__schema-row-type.flix",
  "types__static-as-a-type.flix",
  "types__tuple-and-unit-types.flix",
  "types__type-application.flix",
  "types__unary-type-operators.flix",
  "types__universal-effect-constant.flix",
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
