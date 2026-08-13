# AGENTS.md

Guidance for coding agents working in this repository. `CLAUDE.md` points here, so this is the one
file to edit.

## What this is

A Lezer grammar for Flix plus the CodeMirror 6 language package built on it. It targets **one**
Flix release — the one recorded in `spec.pin.json`. There are no dialects and no compatibility
shims for retired syntax (`law` and `lawful` are ordinary lowercase names).

## Commands

```sh
npm run check          # what CI runs: format:check + lint + typecheck + test
npm test               # Vitest; runs `fetch-spec` first via pretest
npm run fetch-spec     # materialise and verify .spec/ (network on first run)
npm run build          # lezer-generator + Rollup -> dist/
npm run format         # Prettier, in place
npm run lint:fix       # ESLint, in place
```

Run a single test file or case:

```sh
npx vitest run test/spec-cache.test.ts
npx vitest run -t "matches the content digest"
```

Compile the grammar on its own — the fastest loop when working on `src/flix.grammar`, and the
only way to read a conflict report without a bundler's framing around it:

```sh
node --max-old-space-size=8000 scripts/build-grammar.mjs
```

The heap flag is not optional: table construction exhausts the default heap. A successful build
currently takes on the order of a minute, so treat each attempt as expensive and batch fixes.

Move the pin to a newer Flix release (rewrites `spec.pin.json` from flix-spec's own `pin.json`):

```sh
node scripts/fetch-spec.mjs --commit <flix-spec-sha>
```

`npm run check` deliberately does **not** run `npm run build`. A green check therefore does not
mean the grammar compiles — check that separately.

## Ground rules

- **`.spec/` is a fetched cache, not source.** It comes from `wstein/flix-spec` at the commit in
  `spec.pin.json` via `npm run fetch-spec`, and `test/spec-cache.test.ts` re-checks its content
  digest. Never commit it and never edit it in place: if a fixture looks wrong, the fix belongs
  upstream in `flix-spec`.
- **The reference compiler is the authority on syntax, not the Flix documentation.** When they
  disagree, follow `Parser2.scala` / `Lexer.scala` at the pinned commit and cite the line in a
  comment, as the existing rules do. `flix-spec`'s oracle is the reference parser, so agreeing
  with the docs against the parser is a conformance failure.
- **Every token the grammar can produce is named after its upstream `TokenKind`.** Lezer drops
  anonymous tokens, and flix-spec's projected-tree format requires every token as a leaf with its
  text. So rules never contain string literals — punctuation comes from `coreTokens` by name.
- **Node names are the upstream qualified `TreeKind` with the dot dropped** (`Decl.Def` ->
  `DeclDef`), so `conformance/projection-map.json` stays close to an identity function.

## Architecture

### Layering

`src/tokens.ts` (external tokenizers) + `@tokens` (regular tokens) feed the LR(1) tables generated
from `src/flix.grammar`. The tree then goes two ways: to CodeMirror (`styleTags`, fold, indent) and
to a projected tree that `flix-spec` compares against the reference compiler's own.

### Why some tokens are external

`src/tokens.ts` holds six tokenizers: three that lex and three that answer a lookahead question.
The lexing three exist because four constructs cannot be expressed as a DFA — the
whitespace-sensitive `->` (`a->b` is struct access, `a -> b` the function arrow), the `.`
trichotomy (name separator / Datalog terminator / error), nested block comments, and
interpolated-string segmentation. `docs/LEXER.md` has the full contract. The punctuation and fixed-operator tries reproduce
`Lexer.advanceIfInTree` exactly, including its refusal to fall back to a shorter match: `<+x`
stops at the valueless node `<+` and yields nothing rather than the `<` one character back.

### Zero-width lookahead tokens are the disambiguation tool of choice

`Parser2` is recursive descent with unbounded lookahead; it scans forward for `->` to tell
`(a, b) -> e` from a tuple, and again to tell `match p -> e` from `match e { … }`. LR(1) cannot,
and expressing those as Lezer ambiguity markers splits the parse at every identifier — measured at
**111 s vs 8 s** for the same grammar subset, and heap exhaustion at full size.

The pattern that works: an external tokenizer performs the same forward scan the reference
performs and emits a **zero-width token** (`lambdaAhead`, `matchLambdaAhead`, `fixpointCommaAhead`)
that only one branch of the grammar can shift. Reach for this before reaching for `~marker` or
`!precedence`.

### The LR budget

The recurring failure mode is state explosion, not conflicts. A precedence or ambiguity marker
anywhere over `expression` — especially on a repeat whose elements contain `expression`, such as a
greedy comma list — multiplies the state count until table construction exhausts 8 GB. When a
greedy list conflicts with an enclosing argument list, narrow the element class or add a
lookahead token; do not reach for `!marker`.

The same rule applies to keyword constructs with repeated tails. `run … with …` and `try … catch`
enter through `expression`, but their operands use `runOperand`, a deliberately small layer of
atomic and delimited expressions. A full `expression` at each tail boundary would make the
generator carry every expression continuation through every repetition. Complex operands are
therefore written in parentheses or blocks, which restores the full expression grammar within a
delimiter while keeping the outer automaton bounded.

Ambiguity markers are a last resort. Note that `~` resolves shift/reduce but did **not** resolve
the pattern-versus-expression reduce/reduce conflicts here. Every marker that survives should have
a comment saying what reconverges the split and after how many tokens.

### Two Lezer facts that are not in its docs

- **External tokenizers are consulted in grammar source order** (`@lezer/generator` sorts them by
  position in the file), and the first tokenizer producing a token with a valid action wins. This
  is load bearing: `stringTokens` is declared before `coreTokens` so a `}` resuming an interpolated
  string is not taken as `CurlyR`, and the lookahead tokenizers are declared before everything.
- **`@tokens` `@precedence` is not "longest match wins".** An accepted token is only replaced by a
  later, longer one if the new token _overrides_ it — and a token absent from the precedence list
  is always overridden. So listing two overlapping tokens makes the earlier one win _regardless of
  length_; list only pairs where the more specific token should always win, and leave
  length-differing pairs unlisted.

### Relationship to flix-spec

`flix-spec` owns the comparison; this repository owns its own vocabulary. It emits `form: raw`
projected trees plus a `projection-map.json`, and flix-spec applies the normalisation itself. The
oracle lane (structure of valid programs) is the target; the recovery lane will not match, because
Flix has three recovery kinds and Lezer has one error node.

## State of the work

`main` holds the scaffold only. `wip/lexical-layer` holds the lexical layer and the full grammar.
Table construction finishes with the 8 GB heap, and 111 of the 116 positive fixtures parse with no
error node; the eight that do not are listed in `KNOWN_GAPS` in `test/parse-fixtures.test.ts`, each
with a reason and each asserted to _still_ fail, so one that starts parsing fails the suite.

`npm run build` and `npm run typecheck` are both still red there, for the same single reason:
`src/index.ts` and `src/projection.ts` do not exist yet, so Rollup has no entry point and `tsc` has
nothing that resolves `./flix.grammar.terms`.

**`flix.grammar.terms` is not a missing file and must never be committed.** It is a virtual module
the `lezer()` Rollup plugin generates from `src/flix.grammar` at build time; `vitest.config.ts`
loads the same plugin, which is why tests can import the grammar directly while `tsc` — which runs
no bundler — cannot. If making `typecheck` green becomes worthwhile before the entry points land,
the fix is to emit a declaration for the virtual module, not to check generated code in.

Still to be written: `src/index.ts`, `src/highlight.ts`, `src/projection.ts`,
`conformance/projection-map.json`, and `scripts/parse-corpus.mjs` (the `npm run corpus` script).
The divergences the grammar has accumulated are recorded in `docs/CONFORMANCE.md`; add to it
rather than to a commit message when a new one becomes necessary.

## Conventions

- Conventional Commits.
- TypeScript, ESM, strict mode. No `any` in `src/`.
- Run `npm run format` and `npm run lint:fix` before committing.
