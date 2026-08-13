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

**Oracle lane: 3 of 116 fixtures match the reference tree node for node.** They are pinned by name
in `test/conformance.test.ts`, which recomputes the comparison flix-spec performs and fails if a
fixture stops matching. The list only moves up.

The dominant remaining difference is one node, discussed in §3.6.

112 of the 116 positive fixtures parse with no error node. The five that do not are listed in
`KNOWN_GAPS` in `test/parse-fixtures.test.ts`, each with a reason, and each asserted to _still_
fail — so a gap that starts parsing fails the suite and has to be taken off the list.

Those five are defects to fix, not divergences. The divergences are below.

## 3. Accepted divergences

### 3.1 `run` and `try` take a restricted operand

`ExprRun` and `ExprTry` both have a repeated tail (`with …`, `catch { … }`). Admitting the whole of
`expression` before a repetition makes the generator carry every expression continuation through
every repeat, and the tables stop building. Their operand is therefore `restrictedOperand`:

**Permitted** — a literal, a name, an intrinsic, a hole, `Static`, a parenthesised expression, a
tuple, an ascription, a block, and the postfix chain (application, method invocation, field access)
over any of those.

**Not permitted** — an infix application, `if`/`match` and the other control forms, a unary
operator, `throw`. Each becomes acceptable by wrapping it: `run a + b with g` is rejected,
`run (a + b) with g` is accepted.

The reference accepts the unwrapped forms. Asserted in both directions in
`test/parse-fixtures.test.ts`.

### 3.2 Fixpoint operands are a narrow class

The operand list of `solve`, `psolve`, `inject`, `query` and `pquery` sits where an enclosing
argument list also uses commas. A full `expression` on each side of that comma multiplies the state
count past the point where the tables build, so `fixpointOperand` admits a name, a parenthesised
expression, a block, a constraint set, and the postfix chain over those. Anything else must be
parenthesised.

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

### 3.6 `Expr.Expr` — an open question for flix-spec, not a decision here

`fixtures/expected` keeps an `Expr.Expr` node wrapping every expression, and this grammar emits no
such node. It is the first difference in roughly half of the fixtures that still differ, and at
531 of 3519 nodes it is 15.1% of the normalized suite.

Measured over `fixtures/raw` at the pin, `Expr.Expr` holds exactly one child at 530 of its 531
occurrences and holds no token at 530 of them. It is produced by the same idiom as `Type.Type` —
ten `close(openBefore(lhs), …)` calls climbing the expression precedence ladder
(`Parser2.scala:1483, 1511, 1528, 1540, 1546, 1557, 1560, 1571, 1574, 1597`) plus one
`close(mark, …)` closing the delimited production (`1952`), against `Type.Type`'s three at
`3438, 3456, 3465` and one at `3630`. `ast/transparency.json` elides `Type.Type` on exactly that
reasoning.

The one exception is real and worth stating rather than rounding away: in `d"…"` the wrapper holds
both the `DebugInterpolator` token and the expression
(`fixtures/expected/lexical__debug-interpolation.json`). So `Expr.Expr` does not satisfy the
criterion `ast/transparency.json` states for its `elide` entries — "never hold more than one child
and never hold a token". `Type.Type` satisfies it at 296 of 296 occurrences; `Expr.Expr` misses it
once.

That single exception does not make the rule unsafe, because `elide` is arity-sensitive: a node is
replaced by its child only when it has exactly one, and kept otherwise. Applying it would remove
530 wrappers and keep the debug-interpolation one, with no token lost. What it would require is
widening the criterion in the note, which describes the current entries rather than a constraint
the rule mechanically needs.

This repository's position is to raise that upstream rather than emit a wrapper node per
expression to match a shape flix-spec may itself decide is an artifact. Until it is settled, the
difference is measured rather than worked around, and `test/conformance.test.ts` reports it.

## 4. What is not a divergence

`Parser2` accepts more than Flix allows and rejects the excess in `Weeder2`, a phase this grammar
has no equivalent of. Following the parser rather than the language is deliberate: `flix-spec`'s
oracle is the reference _parser_, so rejecting what it accepts would be the conformance failure.
Record literals sharing a production with record operations, and `pub pub def` parsing, are
examples — see [`ARCHITECTURE.md`](ARCHITECTURE.md) §4.
