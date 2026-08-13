# Architecture

Why this grammar is shaped the way it is, and where it deliberately differs from the reference
compiler it was transliterated from.

## 1. Two parsers, two shapes

The Flix reference compiler parses with `Parser2.scala`: a hand-written, resilient recursive-descent
parser that may look ahead as far as it likes. It scans forward over balanced parentheses to decide
whether `(` opens a tuple or a lambda parameter list; it peeks two non-comment tokens to decide
whether `{` opens a block or a record.

Lezer is LR(1) with _local_ GLR. It has one token of lookahead, and it can split the parse stack
only where the grammar says `~marker`. Splits are cheap but must reconverge; an ambiguity marker in
the wrong place makes every expression in the file carry a live fork.

So the two parsers cannot be structurally identical, and the differences are not accidents:

| `Parser2` does                           | This grammar does                                    |
| ---------------------------------------- | ---------------------------------------------------- |
| unbounded scan for `->` after `(`        | GLR split on `~lambda`, reconverging at the arrow    |
| two-token peek to tell block from record | GLR split on `~brace`, reconverging after two tokens |
| precedence climbing in code              | one `@precedence` block, generated into the tables   |
| one error node kind per recovery site    | Lezer's single error node                            |

The grammar also separates `run` and `try` from the general expression operand layer. Their
repeated `with` and `catch` tails use a narrow set of atomic or delimited operands, since placing
the complete recursive `expression` grammar at every tail boundary causes the LR automaton to grow
without a practical bound. Parentheses and blocks retain the full expression language for complex
operands without expanding the outer repetition's state space.

## 2. Layering

```text
source text
  │
  ├─ @tokens              regular tokens: 150-odd of the 158 TokenKinds
  ├─ @external tokens     the four constructs a DFA cannot express (docs/LEXER.md)
  ├─ @external specialize keywords, off the shared name token
  │
  ▼
LR(1) + local GLR tables ──► Lezer Tree ──► styleTags / fold / indent  (CodeMirror)
                                        └─► projection.ts              (flix-spec conformance)
```

## 3. Named tokens are not optional here

Lezer drops anonymous tokens: a `"def"` written inline in a rule produces no tree node. That is
the right default for an editor grammar and the wrong one for this repository, because
`flix-spec`'s projected-tree format requires every token as a leaf carrying `token` and `text`, and
its `TokenAccounting` check asserts that a tree accounts for its whole source.

So every token this grammar can produce is **named**, and named after the upstream `TokenKind` it
corresponds to. That buys three things:

1. The projection map is close to an identity function instead of a translation table.
2. `test/spec/ast/tokenkind.json` becomes a checkable completeness condition — 158 kinds, digest
   pinned, so "which tokens are missing" is a test result rather than an opinion.
3. Highlighting gets to style tokens directly, rather than inferring role from parent node.

The cost is tree size. A Lezer node is 64 bits, and the token count is bounded by the source
length; for editor-sized documents this is not a consideration worth trading the above for.

## 4. What the grammar deliberately accepts

`Parser2` accepts more than the language allows and rejects the excess in `Weeder2` — a later phase
this grammar has no equivalent of. Two examples that show up directly in the rules:

- Record literals and record operations share one production; the difference is a `Weeder2`
  concern (`Parser2.scala:1627-1636`).
- Modifiers are parsed as a list and checked for applicability later, so `pub pub def` parses.

Following `Parser2` here rather than the language reference is deliberate: `flix-spec`'s oracle is
the reference _parser_, so a grammar that rejected these would disagree with the oracle on inputs
the oracle accepts.

## 5. Error recovery

Lezer always produces a tree, and its recovery vocabulary is a single error node. Flix has three
recovery kinds — `ErrorTree`, `OperatorError` and `TrailingDot` — and `flix-spec` measures their
shape in a separate lane precisely because recovery is a strategy rather than a language feature.

This grammar maps its error node to `ErrorTree` and claims nothing about the other two. See
[`CONFORMANCE.md`](CONFORMANCE.md).

## 6. Pinning, without a second copy of flix-spec

`spec.pin.json` records the `flix-spec` commit this repository is measured against, the Flix
release `flix-spec` itself pins, and a content digest over the fetched subset. `npm run fetch-spec`
materialises that subset into the gitignored `.spec/` cache and verifies the digest; `npm test`
runs it first.

The fixtures are deliberately **not** committed here. `flix-spec` owns them, a second copy could
only ever be a stale one, and this repository has no way to notice that it had drifted. The digest
is over sorted `path\0sha256(content)` pairs rather than the tarball bytes, because GitHub does not
promise a stable byte-image for a source archive but does promise its contents.

Moving to a new Flix release is therefore one reviewable commit: `node scripts/fetch-spec.mjs
--commit <sha>` rewrites `spec.pin.json` from `flix-spec`'s own `pin.json`, and whatever turns red
is the work.
