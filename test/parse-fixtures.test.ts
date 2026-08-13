import { describe, expect, it } from "vitest";

import { parser } from "../src/flix.grammar";
import { positiveFixtures } from "./helpers/spec.js";

/**
 * The fixtures flix-spec expects the reference parser to accept. Lezer always produces a tree, so
 * "parses" means the tree carries no error node — anything else would report a file as understood
 * when the grammar had guessed its way through it.
 */
function errorCount(source: string): number {
  let errors = 0;
  const cursor = parser.parse(source).cursor();
  do {
    if (cursor.type.isError) errors++;
  } while (cursor.next());
  return errors;
}

/**
 * Fixtures the reference accepts and this grammar does not, yet. Listed rather than skipped: each
 * entry is asserted to *still* fail, so one that starts parsing fails the suite and has to be
 * taken off the list. Every entry needs a reason, and none of them may be a guess.
 */
const KNOWN_GAPS = new Map<string, string>([
  [
    "datalog__query-with-select-and-from.flix",
    "query clauses were restructured into fixed-order optionals to bound the tables; the shape " +
      "no longer matches Parser2's",
  ],
  ["datalog__query-with-a-where-clause.flix", "same restructuring as query-with-select-and-from"],
  ["datalog__query-piped-into-a-function.flix", "same restructuring, plus the |> continuation"],
  [
    "datalog__inject-several-relations.flix",
    "the fixpointCommaAhead lookahead does not yet fire for every operand shape in the list",
  ],
  [
    "expressions__match-lambda.flix",
    "matchLambdaAhead does not fire for every pattern head Parser2's detectMatchLambda accepts",
  ],
  ["expressions__ext-match-expression-and-lambda.flix", "same as match-lambda, for ematch"],
  [
    "lexical__operators-may-follow-an-arrow.flix",
    "an operator character directly after `->` must keep the arrow out of the token, and the " +
      "core tokenizer's arrow branch does not yet reproduce that",
  ],
  [
    "type-kind-ascription.flix",
    "kind ascriptions in type-parameter position are not wired into the Kind rule",
  ],
]);

describe("bounded operand layers", () => {
  // `run` and `try` take `runOperand` rather than `expression`, to keep the repeated `with` and
  // `catch` tails from carrying every expression continuation. These are the shapes that layer has
  // to keep accepting; `try g()` is also a fixture, and was rejected until the postfix chain was
  // added to it.
  it.each(["run f with g", "try f", "try g() catch { case e: E => 0 }", "run h() with i.j()"])(
    "accepts %s",
    (source) => {
      expect(errorCount(`def f(): Unit = ${source}`), source).toBe(0);
    },
  );
});

describe("positive fixtures", () => {
  const fixtures = positiveFixtures();

  it("has fixtures to check", () => {
    expect(fixtures.length).toBeGreaterThan(100);
  });

  it("lists no gap that is not a fixture", () => {
    const names = new Set(fixtures.map((f) => f.name));
    expect([...KNOWN_GAPS.keys()].filter((name) => !names.has(name))).toEqual([]);
  });

  for (const { name, source } of fixtures) {
    const gap = KNOWN_GAPS.get(name);
    if (gap) {
      it.fails(`still cannot parse ${name} — ${gap}`, () => {
        expect(errorCount(source), name).toBe(0);
      });
    } else {
      it(`parses ${name}`, () => {
        expect(errorCount(source), name).toBe(0);
      });
    }
  }
});
