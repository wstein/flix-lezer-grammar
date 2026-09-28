# Migrating to Flix v0.77.0 and the current flix-spec

Status: **not started.** `spec.pin.json` pins flix-spec commit `3864fbe2...` (tag v0.75.2) and Flix
v0.75.2 (`40949531...`), two releases behind.

## What changed in Flix

This repository is pinned to Flix **v0.75.2** (`40949531`). The reference has moved twice since.

### v0.75.2 → v0.76.0

- Effects accept type parameters. Generic *operations* remain invalid and now report
  `IllegalOperationTypeParams` rather than `IllegalEffectTypeParams`.
- Malformed `match` and `ematch` expressions retain the match node and the scrutinee through
  ordinary recovery instead of collapsing.
- **Vocabulary unchanged**: 191 TreeKinds and 158 TokenKinds, same names, same digests.

### v0.76.0 → v0.77.0

- **`+UsesOrImports.Package`** (TreeKind 191 → 192). `use` now recognises a package path:
  `use flixball::Game.Board` and `use flixball::{Game, Board}`.
- **`+ColonColonTight`** (TokenKind 158 → 159). `::` written **without surrounding whitespace** lexes
  as a distinct token. Tight `::` is the package-path separator; spaced `::` remains list cons.
  Writing the separator with whitespace is now a `Malformed` error.
- Nothing was removed or re-parented. Both releases are additive at the vocabulary level.
- Internally, Flix deleted its `Reader` phase and `shared.Input`. That broke `flix-spec`'s own
  adapter and is fixed there; it does not reach consumers.

> **`ColonColonTight` is the one that bites quietly.** Upstream left `("::", ColonColon)` in the
> lexer's operator table and decides tightness in hand-written dispatch outside every table. Nothing
> that scrapes or reflects over that table sees a change. A rule matching `ColonColon` today simply
> stops matching `a::b`, with no error anywhere.

## What changed in flix-spec

Beyond the pin, the release you are moving to changes four things that affect consumers.

**1. The transparency contract is stated per occurrence, and is much larger.**
It used to admit a kind only if *every* occurrence had at most one child. It now fires per
occurrence — dropped when empty, replaced when singular, kept when branching — which admitted four
kinds every structural consumer was already eliding for itself: `Expr.Expr`, `Pattern.Pattern`,
`QName`, `UsesOrImports.UseOrImportList`. A third rule, `elide-empty`, drops empty `AnnotationList`
and `ModifierList` without splicing their tokens.

Normalisation now removes **2301 of 4484 nodes (51.3%)**, up from 753 of 4398 (17.1%). Canonical
trees are substantially smaller and every baseline is stale.

Because the rules fire per occurrence, an elided kind is **not always absent**: `QName` survives
wherever a name is qualified (23 occurrences), and `ModifierList` wherever it holds a modifier (12).
Mappings onto those are legitimate, and `validateProjectionMap` now decides that by measuring
`fixtures/expected` rather than inferring it from the rule name.

**2. A fourth lane: `diagnostic_conformance`.**
It compares whether the same units are **rejected**, and whether each carries the same gated
`kind`/`line`. Accept/reject needs no tree, no projection map and no shared vocabulary. If your
diagnostic names are your own, declare `diagnosticMappings` in your projection map; without it the
lane compares accept/reject alone and says so. A consumer that emits no diagnostics at all is
`not-applicable`, not failed.

**3. Depth is published and can be gated.**
Reports now carry `nodesExpected` and `depthPercent` beside `nodesCompared`, and the CLI accepts
`--depth-floor` / `--recovery-depth-floor`. Report `schemaVersion` is **7**. A version-6 report's
depth was computed against the walk rather than the expectation — it read *highest* for the maps
that skipped most — so old and new depth figures are not comparable.

**4. `source_invariants` gained `token-positions`.**
Token `start`/`end` were schema-required and read by nothing. The lane now checks that each token's
text is what its source holds at those offsets, that tokens advance in order, and that what lies
between them is only whitespace or the `$` escape. It stands down for consumers that emit no tokens.

New projection-map keys, both optional: `dropWhenEmpty` (the consumer-side counterpart of
`elide-empty`) and `diagnosticMappings`.

## Adopt 0.77.1, not 0.77.0

`0.77.1` carries the **same upstream pin** as `0.77.0` and is additive for consumers: the three
vocabularies are unchanged, the report `schemaVersion` stays 7, and both fixture forms keep their
shape. Pin to it directly.

What it adds:

- **`ast/annotation.json`** — the 16 annotations the reference defines, digest-pinned in `pin.json`.
  A third vocabulary, because the lexer emits a single `TokenKind.Annotation` for every one of them
  and the name survives only in the token's `text`, where no `TokenKind` digest can see it change.
  It is a **coverage** vocabulary and never a validity check: the token is genuinely open, because
  Java interop annotations lex identically and upstream models exactly that with
  `Annotation.Error`. 13 of the 16 occur in Flix's own 893-file corpus.
- **`ast/retired.json`** — vocabulary the reference once defined and has removed, with the tag each
  went at: `Decl.Law`, `KeywordLaw` and `KeywordLawful`, all gone at v0.75.2. An added kind appears
  in the inventory under a name you can look up; a removed one leaves only a digest that stopped
  matching, and this is what survives it.
- **The fixture suite is 147**, not 146 — one fixture covers the three annotations Flix's own
  corpus never exercises (`@Deprecated`, `@DontInline`, `@Skip`).
- **FLIX-0002 in the defect ledger.** flix-spec now runs `Weeder2` over its positive fixtures,
  advisory only, and the first run found a reference defect: `Parser2` has a dedicated
  `BinaryOp.NameMath` and lists `NameMath` in `FIRST_BINARY_OP`, so `a ⊆ b` parses cleanly into
  `Expr.Binary`, while `Weeder2`'s operator match omits `NameMath` and throws
  `InternalCompilerException`. Confirmed against the released jar, which prints the compiler's own
  bug-report banner. Nothing is required of a parser — the reference's own parser accepts the input
  and produces the tree flix-spec publishes — but it bounds what a *positive* fixture means here:
  it parses, and that is all it promises.

## What this repository must do

### 1. Move the pin and the content digest

`spec.pin.json` carries three things that all move together:

- `flixSpec.commit` — the flix-spec commit `scripts/fetch-spec.mjs` materialises into `.spec/`.
  For 0.77.1 that is `11072795d7a656d4de308ff057013c41e4245a21` (tag `v0.77.1`).
- `flixSpec.contentDigest` — a SHA-256 over the sorted (path, content-digest) pairs of the fetched
  subset. **This will change substantially**, not incidentally: `fixtures/expected` is regenerated
  under a contract that removes three times as many nodes, and `fixtures/raw`, `fixtures/positive`
  and `fixtures/negative` each gain two files.
- `flix.tag` / `flix.commit` / `flix.oracleSha256` — to `v0.77.0`,
  `4a5b60a31ac03bb762f68b554a0fc2b6f4d982b9`, and
  `20007d79f97b696ba388113e2a4235227691d33a00bfa669f2316b37a7b14201`.

Re-run `scripts/fetch-spec.mjs` and take the digest it reports; do not hand-compute it.

### 2. Your `ignored` list is unaffected, but your mappings need a look

`conformance/projection-map.json` declares `ignored` in your own native vocabulary — `Argument`,
`ExprHoleVariable`, `ExprQName`, `PatternVariable`, `TypeArgument`, `TypeEffect` — and native names
are never touched by a canonical contract change. Leave them.

What does change: six of your **mapping targets** are now elided by `ast/transparency.json`:

```
AnnotationList  Expr.Expr  ModifierList  Pattern.Pattern  QName  UsesOrImports.UseOrImportList
```

Every one of them still **survives** somewhere in the canonical tree — `QName` 23 times wherever a
name is qualified, `ModifierList` 12 times wherever it holds a modifier — so all six mappings stay
valid and `validateProjectionMap` will accept them. They now match only the branching cases, which
is what makes them worth having.

Note that `ExprQName` in your `ignored` list is the same judgement flix-spec has now adopted
centrally: four independent consumers reached it, which is why it moved into the shared contract.

### 3. Re-measure

The suite goes to **147** fixtures and the canonical trees are much smaller. Every conformance
number and every fixture-derived expectation in `test/` is stale. Re-run before reading anything as
a regression.

### 4. `::` and the package path

Lezer's tokenizer must distinguish tight `::` from spaced `::`. Lezer has no built-in
whitespace-sensitivity between tokens, so this needs an external tokenizer or a context tracker —
it will not fall out of the existing `::` token. The tight form is the package-path separator inside
a `use`; the spaced form remains list cons.

Add a node for the package segment and map it to `UsesOrImports.Package`, covering
`use flixball::Game.Board` and `use flixball::{Game, Board}`.

### 5. The diagnostic lane

You emit no diagnostics, so the new lane reports `not-applicable` and will not fail the build. You
do declare `recoveryMarkers: ["⚠"]`, so you already model Lezer's error nodes — emitting one
diagnostic per `⚠` node would *measure* accept/reject across all 147 fixtures for very little
work, and is the only lane that measures error behaviour rather than error *shape*.

## Two guards worth adding while you are here

Neither is required by the release. Both close gaps this migration exposed.

### Emit only diagnostics the lexer or `Parser2` would raise

flix-spec's pipeline stops after `Parser2`: `ProjectionExtractor` collects
`lexerErrors ++ parserErrors` and nothing else, and `docs/CONFORMANCE.md` calls `Weeder2` errors
"out of scope by construction, not a gap".

So `diagnostic_conformance` compares against a **parse-phase-only** set. A spaced `::` reported as
`Malformed` is fine, because `Parser2` raises it. But every validation-level check you later write
into the projection output — duplicate modifiers, arity rules, anything `Weeder2` would own — adds a
diagnostic the canonical side does not have, and breaks `kind`/`line` agreement on exactly the
negative fixtures the lane is there to measure.

Tag each check with the phase that owns it: parse-phase diagnostics go into the projection,
validation-only diagnostics go to your CLI and stay out of it.

### Assert the vocabulary digests, not just the pin commit

`law` and `lawful` stopped being keywords at Flix v0.75.2 and went stale here without anyone
noticing, because a commit SHA moving tells you *that* the vocabulary changed, never *what*
changed — and nothing compared the names.

Record `treeKindDigest` and `tokenKindDigest` from `pin.json` alongside the pin you already track,
and fail on a mismatch. It costs two fields and forces a review at the next vocabulary change
instead of after it.

Two cheap follow-ons, now that `ast/retired.json` exists:

- assert that nothing in your keyword or token table matches a `Keyword*` entry in
  `ast/retired.json` — that pins the `law`/`lawful` class of staleness as a regression test;
- remember the digest cannot see an existing kind's *extension* being re-partitioned. It caught
  `ColonColonTight` only because a **new name** appeared. When a name is added, ask what it took
  from; the answer belongs in a fixture.
