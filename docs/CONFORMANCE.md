# Conformance

What this grammar claims against [`flix-spec`](https://github.com/wstein/flix-spec), and what it
does not. Every divergence below is deliberate, has a reason that is about LR parsing rather than
about Flix, and is asserted by a test — a narrowing nobody tests is one nobody notices moving.

## 1. The three lanes

`flix-spec` compares a consumer's projected tree against the reference compiler's in three lanes
that are never summed. This repository's position on each:

| Lane                   | Claim                                                                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `oracle_conformance`   | The target. Structure of valid programs, modulo error recovery.                                                                                    |
| `recovery_conformance` | **Not claimed.** Flix has three recovery kinds (`ErrorTree`, `OperatorError`, `TrailingDot`); Lezer has one error node, which maps to `ErrorTree`. |
| `source_invariants`    | The target. Oracle-free: shape, vocabulary and token accounting against this grammar's own input.                                                  |

## 2. Current state

**Corpus: 861 of 874 upstream `.flix` files parse with no error node** (`npm run corpus`, against
the checkout `corpus/corpus.json` pins by tree hash). Two of the remainder are not valid Flix — the
reference rejects them too, with the reason recorded in `scripts/parse-corpus.mjs`. The other
eleven are the operand narrowings of §3.1 and §3.2 meeting code that needs more than they admit.

**Oracle lane: 115 of 116 fixtures match the reference tree node for node.** They are pinned by name
in `test/conformance.test.ts`, which recomputes the comparison flix-spec performs and fails if a
fixture stops matching. The list only moves up.

The dominant remaining difference is one node, discussed in §3.6.

112 of the 116 positive fixtures parse with no error node. The five that do not are listed in
`KNOWN_GAPS` in `test/parse-fixtures.test.ts`, each with a reason, and each asserted to _still_
fail — so a gap that starts parsing fails the suite and has to be taken off the list.

All 116 parse with no error node; `KNOWN_GAPS` in `test/parse-fixtures.test.ts` is empty.

The one that does not is an accepted divergence rather than a defect — comment ownership across a
node boundary, §3.5a — and it is listed with its reason in `ACCEPTED_DIVERGENCES` in
`test/conformance.test.ts`. Every other fixture is asserted to match, so a regression there fails
the suite.

## 3. Accepted divergences

### 3.1 `run` and `try` take a restricted operand

`ExprRun` and `ExprTry` both have a repeated tail (`with …`, `catch { … }`). Admitting the whole of
`expression` before a repetition makes the generator carry every expression continuation through
every repeat, and the tables stop building. Their operand is therefore `restrictedOperand`:

**Permitted** — a literal, a name, an intrinsic, a hole, `Static`, a parenthesised expression, a
tuple, an ascription, a block, a handler, and the postfix chain (application, method invocation,
field access) over any of those.

**Not permitted** — an infix application, `if`/`match` and the other control forms, a unary
operator, `throw`. Each becomes acceptable by wrapping it: `run a + b with g` is rejected,
`run (a + b) with g` is accepted.

The reference accepts the unwrapped forms. Asserted in both directions in
`test/parse-fixtures.test.ts`.

### 3.2 Fixpoint operands are a narrow class

The operand list of `solve`, `psolve`, `inject`, `query` and `pquery` sits where an enclosing
argument list also uses commas. A full `expression` on each side of that comma multiplies the state
count past the point where the tables build, so `fixpointOperand` admits a name, a parenthesised
expression, a tuple, a literal, a block, a constraint set, the four brace-delimited collection
literals, and the postfix chain — application and record selection — over those. Anything else must
be parenthesised.

Not `Array#{…} @ rc`, though every other collection literal is admitted: an array literal ends in a
region expression, and that trailing `expression` puts the whole grammar back on the left of the
comma. The corpus is what showed both which forms were needed and which one could not be given.

Which of the two readings a given comma has is decided by `fixpointCommaAheadToken`, a zero-width
lookahead token — see [`ARCHITECTURE.md`](ARCHITECTURE.md).

### 3.3 The `where` clause of a query binds last

`Parser2` takes the query clauses in the fixed order `select`, `from`, `where`, each optional. This
grammar keeps that order and requires `where` to come last, because that is what lets a single
precedence marker settle whether a trailing `where` belongs to the query or to the enclosing
declaration. `datalog__query-with-a-where-clause.flix` is currently a `KNOWN_GAPS` entry rather
than a settled divergence.

### 3.4 An escaped name keeps its `$`

`Lexer.acceptEscapedName` (Lexer.scala:518) calls `resetStart()` before reading the name, so the
reference's token for `$run` covers `run` and the `$` belongs to no token at all. A Lezer token
begins where its tokenizer began, so `NameLowercase` here covers `$run`.

This is the one divergence that is not a choice: it is a property of the two tokenizer models. It
affects the token's extent, never which token it is.

### 3.5 Malformed literals are not error tokens

The reference lexer emits a single `Err` token kind for a malformed number, an unterminated string,
a free dot and so on, each covering the whole malformed region. This grammar does not model `Err`:
malformed input goes through Lezer's error recovery instead, which produces a different shape for
the same input. That difference is confined to the recovery lane, which §1 already does not claim.

### 3.5a Comment runs are regrouped; where the reference splits one is not recoverable

`Parser2.open()` takes any run of comments at the node it is opening into a `CommentList`.
Comments are `@skip` tokens here, and Lezer cannot group skipped tokens under a node, so
`src/projection.ts` regroups a maximal run of adjacent comment children into one `CommentList`. It
reorders nothing and drops nothing, and it is the one place the projector builds a node the grammar
did not.

What it cannot do is reproduce **where** the reference splits a run. `open()` is called as each node
begins, so a run spanning a declaration boundary is divided between the enclosing node and the
declaration:

```text
// a line comment          -> CommentList under Root
/// a doc comment          -> CommentList under Decl.Def
//// still a line comment  -> ...the same one
```

Lezer attaches every skipped token to the node the run started in, so all three arrive under `Root`
and the projector sees one run where the reference saw two. The split point is a fact about the
reference's control flow, not about the token stream, and it is not information this tree carries.

Reconstructing it would mean the projector deciding which node a comment belongs to — inventing
structural attachment rather than regrouping what the parse produced. That is a larger claim than
this layer should make for one fixture, so `lexical__line-and-doc-comments.flix` is listed in
`ACCEPTED_DIVERGENCES` in `test/conformance.test.ts` and the limitation is stated here instead.

If corpus measurement later shows boundary-split runs are common enough to matter, the decision is
worth revisiting; a single fixture is not evidence that it is.

### 3.6 `Expr.Expr` and `Pattern.Pattern` are produced, not declared away

The reference closes an `Expr.Expr` around every expression and a `Pattern.Pattern` around every
pattern, and this grammar now does the same. Neither is a divergence; the entry is kept because the
reasoning behind it is worth not repeating.

The tempting move was to treat `Expr.Expr` as a wrapper flix-spec ought to elide, on the grounds
that it is produced by the same `close(openBefore(lhs), …)` precedence-climb idiom as `Type.Type`,
which `ast/transparency.json` does elide. Measurement says otherwise. `flix-spec`'s
`proposeTransparency` requires that _every_ occurrence of a kind have at most one child and never a
token child, and `Expr.Expr` misses it exactly once: in `d"…"` it holds the `DebugInterpolator`
token beside its child. That criterion is a claim about the production, not about occurrences —
relaxing it to "wherever the rule fires" makes the same tool propose `Root` and `ParameterList`,
which is how one can tell the original was load bearing.

So the reference reuses one kind for two productions, and a consumer has to produce both. Doing it
moved the oracle lane from 3 of 116 fixtures to 27, and `Pattern.Pattern` took it to 36.

## 4. What is not a divergence

`Parser2` accepts more than Flix allows and rejects the excess in `Weeder2`, a phase this grammar
has no equivalent of. Following the parser rather than the language is deliberate: `flix-spec`'s
oracle is the reference _parser_, so rejecting what it accepts would be the conformance failure.
Record literals sharing a production with record operations, and `pub pub def` parsing, are
examples — see [`ARCHITECTURE.md`](ARCHITECTURE.md) §4.
