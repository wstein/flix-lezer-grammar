# CLAUDE.md

Guidance for working in this repository.

## What this is

A Lezer grammar for Flix plus the CodeMirror 6 language package built on it. It targets **one**
Flix release — the one in `test/spec/PIN.json`. There are no dialects and no compatibility shims
for retired syntax.

## Ground rules

- **`.spec/` is a fetched cache, not source.** It comes from `wstein/flix-spec` at the commit in
  `spec.pin.json` via `npm run fetch-spec`, and `test/spec-cache.test.ts` re-checks its content
  digest. Never commit it and never edit it in place: if a fixture looks wrong, the fix belongs
  upstream in `flix-spec`.
- **The reference compiler is the authority on syntax, not the Flix documentation.** When they
  disagree, follow `Parser2.scala` / `Lexer.scala` at the pinned commit and cite the line in a
  comment. `flix-spec`'s oracle is the reference parser, so agreeing with the docs against the
  parser is a conformance failure.
- **Every token the grammar can produce is named after its upstream `TokenKind`.** This is load
  bearing for projection and token accounting — see `docs/ARCHITECTURE.md` §3.
- **Ambiguity markers are a last resort.** Prefer restructuring a rule over adding `~marker`.
  Every marker that survives should have a comment saying what reconverges the split and after how
  many tokens.

## Commands

```sh
npm run check       # what CI runs: format:check + lint + typecheck + test
npm run build       # lezer-generator + Rollup
npm test            # Vitest; fetches .spec/ first if absent
npm run fetch-spec  # materialise and verify .spec/ (network on first run)
npm run corpus      # parse every .flix in an upstream checkout (network on first run)
```

Run `npm run format` and `npm run lint:fix` before committing.

## Conventions

- Conventional Commits.
- TypeScript, ESM, strict mode. No `any` in `src/`.
- Grammar rule names follow Lezer convention (capitalised nodes appear in the tree); node names are
  chosen so that the `flix-spec` projection map stays close to an identity function.
