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
 * Fixtures the reference accepts and this grammar does not. Empty, and meant to stay that way:
 * every entry is asserted to *still* fail, so one that starts parsing fails the suite and has to
 * be taken off the list. An entry needs a reason, and none of them may be a guess.
 */
const KNOWN_GAPS = new Map<string, string>();

describe("fixpoint comma lookahead", () => {
  // `fixpointCommaAheadToken` decides whether a `,` continues a fixpoint operand list or closes an
  // enclosing one, by looking at what follows it. It has to recognise every character a
  // `fixpointOperand` can start with, and it is consulted before `coreTokens`, so recognising one
  // it cannot follow through on costs the plain `Comma` reading rather than falling back to it.
  it.each([
    ["uppercase name", "solve db, Other"],
    ["lowercase name", "solve db, other"],
    ["application", "inject map(g, pos), map(g, neg) into A/2, B/2"],
    ["parenthesised", "solve db, (other)"],
    ["block", "solve db, { other }"],
    ["constraint set", "solve db, #{ A(1). }"],
    ["past a line comment", "solve db, // note\n    Other"],
    ["past a block comment", "solve db, /* note */ Other"],
    ["past a nested block comment", "solve db, /* a /* b */ c */ Other"],
  ])("continues the list before a %s", (_kind, body) => {
    expect(errorCount(`def f(): Unit = ${body}`), body).toBe(0);
  });

  it("leaves an argument-list comma alone", () => {
    // The `,` here closes `g`'s first argument; taking it as a list continuation would swallow it.
    expect(errorCount("def f(): Unit = g(solve db, 1)")).toBe(0);
  });
});

describe("query clauses", () => {
  // `select` takes a bounded operand and `where` the full expression grammar. The asymmetry is not
  // arbitrary: a nested query in `select` position would leave a following `where` claimable by
  // either query, while nothing that can follow `where` is claimable by a nested one.
  it.each([
    "query db select (x, y) from Edge(x, y) where x < y",
    "query db select x from R(x)",
    "query db, pr select x from Reachable(x)",
    "query db where a and b",
  ])("accepts %s", (source) => {
    expect(errorCount(`def f(): Unit = ${source}`), source).toBe(0);
  });
});

describe("bounded operand layers", () => {
  // `run` and `try` take `restrictedOperand` rather than `expression`, to keep their repeated
  // `with` and `catch` tails from carrying every expression continuation. The boundary is asserted
  // in both directions, because a narrowing nobody tests is one nobody notices moving.
  it.each([
    "run f with g",
    "try f",
    "try g() catch { case e: E => 0 }",
    "run h() with i.j()",
    "run (a + b) with g", // the delimited form of a rejected operand
    "run { throw e } with g",
    "run (x: T) with g",
  ])("accepts %s", (source) => {
    expect(errorCount(`def f(): Unit = ${source}`), source).toBe(0);
  });

  // Rejected, and documented as an intentional divergence in docs/CONFORMANCE.md: the reference
  // accepts these, and each becomes acceptable here by wrapping the operand in `(…)` or `{…}`.
  it.each([
    "run a + b with g",
    "run if (c) a else b with g",
    "run throw e with g",
    "run -a with g",
  ])("rejects %s, which the reference accepts", (source) => {
    expect(errorCount(`def f(): Unit = ${source}`), source).toBeGreaterThan(0);
  });
});

describe("constructs the corpus found", () => {
  // Each of these parsed in no fixture and failed in real Flix, which is the argument for running
  // `npm run corpus` and not only the 116 curated files.
  it.each([
    // A lone `_` is a parameter. The lambda lookahead required a letter after the optional
    // leading `_`, so every `_ -> e` in the standard library was read as something else.
    ["a wildcard lambda parameter", "def f(): Unit = Map.foldRight(_ -> v -> v, m)"],
    ["two of them", "def f(): Unit = g(k -> _ -> Set.insert(k), s)"],
    // The `}` of an empty brace pair was taken as a resumption of an interpolated string, and the
    // scan ran on to the next quote in the file.
    ["an empty collection before a string", 'def f(): Unit = g(a = Vector#{}, h(""))'],
    ["an empty map before a string", 'def f(): Unit = g(a = Map#{}, h("x"))'],
    [
      "an empty set in an argument",
      'def f(): Unit = eq(expected = Ok(Set#{}), map(flags, of("")))',
    ],
    // `run e with handler H { ... }` is how effects are handled throughout the corpus, and the
    // handler was not in the operand class `run` accepts.
    [
      "a handler as a run operand",
      "def f(): Unit = run g() with handler H { def op(x, k) = k(x) }",
    ],
    // Fixpoint operands richer than a bare name.
    ["a record select in an inject", "def f(): Unit = inject p#classes into Class/1"],
    ["a collection literal in an inject", "def f(): Unit = inject Vector#{2, 3} into P/1"],
  ])("parses %s", (_what, source) => {
    expect(errorCount(source), source).toBe(0);
  });
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
