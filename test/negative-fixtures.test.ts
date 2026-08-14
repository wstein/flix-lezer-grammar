import { describe, expect, it } from "vitest";

import { parser } from "../src/flix.grammar";
import { negativeFixtures } from "./helpers/spec.js";

/**
 * The sources flix-spec expects the reference to reject or recover from. Nothing asserted this
 * until a generator warning about an "unused" rule turned out to mean `static` was not reserved
 * here at all, and `def f(): Unit = static` — a fixture the reference rejects — parsed cleanly.
 *
 * Rejecting invalid input is as much a property of a grammar as accepting valid input, and it is
 * the only thing that holds the reserved-but-unusable tokens in place: nothing else in this
 * repository would notice if `forall` quietly became an ordinary name again.
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
 * Negative fixtures this grammar accepts. Each is a source the reference rejects for a reason that
 * lives in its lexer rather than its parser, which this grammar has no equivalent of — see
 * docs/CONFORMANCE.md §3.5. Asserted to *still* be accepted, so one that starts failing has to be
 * taken off the list rather than silently changing what the suite claims.
 */
const ACCEPTED = new Map<string, string>([
  [
    "declarations__doc-comment-misplaced-before-paren.flix",
    "the reference reports a misplaced doc comment from Weeder2, a phase after parsing; comments " +
      "are skip tokens here and a misplaced one is not a syntax error",
  ],
]);

describe("negative fixtures", () => {
  const fixtures = negativeFixtures();

  it("has fixtures to check", () => {
    expect(fixtures.length).toBeGreaterThan(10);
  });

  it("lists no accepted fixture that is not a fixture", () => {
    const names = new Set(fixtures.map((f) => f.name));
    expect([...ACCEPTED.keys()].filter((name) => !names.has(name))).toEqual([]);
  });

  for (const { name, source } of fixtures) {
    const accepted = ACCEPTED.get(name);
    if (accepted) {
      it(`still accepts ${name} — ${accepted}`, () => {
        expect(errorCount(source), name).toBe(0);
      });
    } else {
      it(`rejects ${name}`, () => {
        expect(errorCount(source), name).toBeGreaterThan(0);
      });
    }
  }
});
