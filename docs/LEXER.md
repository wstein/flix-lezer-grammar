# The lexical layer

Which tokens come from where, why six of them are written in JavaScript rather than in `@tokens`,
and where the result differs from `Lexer.scala`. Line citations are against the release pinned in
`spec.pin.json`.

## 1. Six tokenizers, two jobs

`src/tokens.ts` exports six external tokenizers. Three of them lex; three of them answer a question
the parser cannot answer for itself.

| Tokenizer                 | Job                                                                        |
| ------------------------- | -------------------------------------------------------------------------- |
| `coreTokens`              | Punctuation, fixed operators, user-defined operators, the arrows, the dots |
| `stringTokens`            | String literals, interpolation segments, the `d` of a debug interpolation  |
| `commentTokens`           | Line, doc and block comments                                               |
| `matchLambdaAheadToken`   | Zero-width: is this `match`/`ematch` a lambda?                             |
| `lambdaAheadToken`        | Zero-width: does a lambda head start here?                                 |
| `fixpointCommaAheadToken` | Zero-width: does this `,` continue a fixpoint operand list?                |

**Declaration order is load bearing.** `@lezer/generator` sorts tokenizers by their position in the
grammar file, and the first one to produce a token with a valid action wins. The three lookahead
tokenizers are declared first so their answer is taken before anything else claims the position;
`stringTokens` precedes `coreTokens` so a `}` that resumes an interpolated string is not read as
`CurlyR`. Reordering the `@external tokens` blocks changes the language.

Everything else — names, numbers, char and regex literals, annotations, intrinsics, holes and the
collection-literal keywords — is an ordinary `@tokens` rule, and every keyword is
`@specialize`d off the name token, which reproduces the reference's rule that a keyword is only a
keyword when no name character follows it (Lexer.scala:399).

## 2. The four constructs a DFA cannot express

These are why `coreTokens`, `stringTokens` and `commentTokens` exist at all.

**The arrow's whitespace (Lexer.scala:351).** `a->b` is struct field access and `a -> b` is the
function arrow, so the token depends on the characters on _both_ sides. `->` is an arrow only when
no operator character follows the `>`; otherwise the whole run is one user-defined operator.

**The dot's three readings (Lexer.scala:314).** A dot with a space before it is an error; a dot
with a space after it terminates a Datalog constraint; a dot with neither separates the segments of
a qualified name. This is why `.` at the end of a Datalog rule cannot be confused with the `.` in
`Foo.Bar` without any parser involvement at all.

**Nested block comments (Lexer.scala:883).** `/* /* */ */` needs a counter.

**String interpolation (Lexer.scala:556, 611).** A string is cut into segments by `${…}` holes that
contain arbitrary expressions, including further strings. The reference tracks the nesting with its
own counter. Here the parser does it: `stringTokens` is only consulted in states where a
resumption is grammatically possible, so a `}` closing a block inside a hole is never offered to
it. Note that the reference reuses `LiteralStringInterpolationL` for a middle segment — a segment
runs from the previous `}` to the next `${` — so a two-hole string yields `L expr L expr R`.

## 3. Faithfulness of the operator and punctuation tries

`coreTokens` reproduces `Lexer.advanceIfInTree` (Lexer.scala:406) rather than approximating it,
including the part that is easy to get wrong: **it does not fall back to a shorter match.** The
walk descends as far as characters match, then checks a tail condition against the character that
left the trie — no name character may follow a keyword, no operator character may follow a fixed
operator. If the node it stopped at carries no token, the result is nothing at all, not the token
one character back. `<+x` therefore stops at the valueless node `<+` and yields no fixed operator,
which is what lets the user-defined operator branch take `<+` whole.

The same file also carries the reference's less obvious lexical facts: `!` and `$` are name
characters, so `x!=y` is `x!`, `=`, `y` and not `x`, `!=`, `y` (Lexer.scala:495); a leading `_`
joins a name, a math name or an operator (Lexer.scala:365); a doc comment is exactly three slashes,
so `////` is a line comment again (Lexer.scala:872).

## 4. The zero-width lookahead tokens

`Parser2` decides three questions by scanning forward, which LR(1) cannot do. Expressing them as
Lezer ambiguity markers splits the parse at every identifier and costs more states than the whole
rest of the grammar — 111 s versus 8 s to build the same subset, and heap exhaustion at full size.

So each scan is performed once, in a tokenizer, and its answer handed to the parser as a zero-width
token that only one branch can shift. This is closer to what the reference does than the markers
were, as well as cheaper.

Two properties matter when changing them:

- **A lookahead token must be neither too eager nor too shy.** Because these tokenizers are
  consulted before `coreTokens`, emitting a token the parser cannot use costs the ordinary reading
  of that position rather than falling back to it. `fixpointCommaAheadToken` must recognise exactly
  the characters a `fixpointOperand` can begin with — including `#{` but not a bare `#`.
- **They scan raw characters, so they step over trivia themselves.** `skipTrivia` handles
  whitespace, line and doc comments, and nested block comments; both scanners use it.

Scans are bounded by `MAX_LOOKAHEAD`. A head longer than that reads as an ordinary expression,
which is the reading the parser would have reached anyway had no arrow followed.

## 5. Divergences from the reference

Two, both recorded with their reasons in [`CONFORMANCE.md`](CONFORMANCE.md):

- **An escaped name keeps its `$`.** `resetStart()` (Lexer.scala:518) makes the reference's token
  for `$run` cover `run` alone; a Lezer token starts where its tokenizer started, so this one
  covers `$run`. A difference of extent, never of which token it is.
- **There is no `Err` token.** Malformed numbers, unterminated strings and free dots go through
  Lezer's error recovery instead of becoming a token, which changes the shape of the tree for
  malformed input only.
