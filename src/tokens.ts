// External tokenizers for the constructs Flix's lexer resolves with information a DFA does not
// have: characters before the token, unbounded nesting, and a string body that is interrupted by
// arbitrary expressions.
//
// Every rule here is transliterated from `main/src/ca/uwaterloo/flix/language/phase/Lexer.scala`
// at the pinned release (see `spec.pin.json`), and cites the line it came from. Where this
// deviates from the reference, `docs/LEXER.md` says so and why.

import { ExternalTokenizer, type InputStream } from "@lezer/lr";

import {
  Ampersand,
  AngleL,
  AngleLEqual,
  AngleR,
  AngleREqual,
  AngledEqual,
  AngledPlus,
  ArrowThickR,
  ArrowThinL,
  ArrowThinRTight,
  ArrowThinRWhitespace,
  Backslash,
  Bang,
  BangEqual,
  Bar,
  BarHash,
  BracketL,
  BracketR,
  Caret,
  Colon,
  ColonColon,
  ColonColonColon,
  ColonMinus,
  Comma,
  CommentBlock,
  CommentDoc,
  CommentLine,
  CurlyL,
  CurlyR,
  DebugInterpolator,
  Dollar,
  Dot,
  DotWhiteSpace,
  Equal,
  EqualEqual,
  GenericOperator,
  Hash,
  HashBar,
  HashCurlyL,
  HashParenL,
  HoleAnonymous,
  LiteralString,
  LiteralStringInterpolationL,
  LiteralStringInterpolationR,
  Minus,
  ParenL,
  ParenR,
  Plus,
  Semi,
  Slash,
  Star,
  Tick,
  Tilde,
  lambdaAhead,
  matchLambdaAhead,
  fixpointCommaAhead,
} from "./flix.grammar.terms";

function isMathName(ch: number): boolean {
  return ch >= 0x2200 && ch <= 0x22ff;
}

const enum Ch {
  Newline = 10,
  Quote = 34,
  Hash = 35,
  Dollar = 36,
  Star = 42,
  Minus = 45,
  Dot = 46,
  Slash = 47,
  Apostrophe = 39,
  ParenL = 40,
  ParenR = 41,
  Comma = 44,
  Semi = 59,
  Equal = 61,
  Gt = 62,
  BracketL = 91,
  Backslash = 92,
  BracketR = 93,
  Underscore = 95,
  LowerD = 100,
  CurlyL = 123,
  CurlyR = 125,
}

/** Lexer.scala:902 — the reference lexer is ASCII-only for letters. */
function isLetter(ch: number): boolean {
  return (ch >= 97 && ch <= 122) || (ch >= 65 && ch <= 90);
}

/** Lexer.scala:535 — the characters a user-defined operator may be built from. */
function isUserOp(ch: number): boolean {
  switch (ch) {
    case 43: // +
    case 45: // -
    case 42: // *
    case 60: // <
    case 62: // >
    case 61: // =
    case 33: // !
    case 38: // &
    case 124: // |
    case 94: // ^
    case 36: // $
      return true;
    default:
      return false;
  }
}

/** Lexer.scala:495 — the characters a name may contain after its first. */
function isNameChar(ch: number): boolean {
  return (
    isLetter(ch) ||
    (ch >= 48 && ch <= 57) ||
    ch === Ch.Underscore ||
    ch === 33 /* ! */ ||
    ch === Ch.Dollar
  );
}

/**
 * Java's `Character.isWhitespace`, restricted to what the reference lexer can encounter. Only the
 * decision "is this a space" matters here, never which one.
 */
function isWhitespace(ch: number): boolean {
  return (
    ch === 32 ||
    (ch >= 9 && ch <= 13) ||
    ch === 0x1c ||
    ch === 0x1d ||
    ch === 0x1e ||
    ch === 0x1f ||
    ch === 0x2028 ||
    ch === 0x2029 ||
    ch === 0x3000 ||
    (ch >= 0x2000 && ch <= 0x200a) ||
    ch === 0x1680
  );
}

/**
 * A prefix trie over a fixed token table, reproducing `Lexer.advanceIfInTree` (Lexer.scala:406)
 * exactly — including its refusal to fall back to a shorter match. `<+x` matches the node `<+`,
 * which carries no token, and yields nothing at all rather than the `<` one character back.
 */
interface TrieNode {
  term: number;
  next: Map<number, TrieNode>;
}

function trie(entries: [string, number][]): TrieNode {
  const root: TrieNode = { term: -1, next: new Map() };
  for (const [text, term] of entries) {
    let node = root;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      let child = node.next.get(code);
      if (!child) {
        child = { term: -1, next: new Map() };
        node.next.set(code, child);
      }
      node = child;
    }
    node.term = term;
  }
  return root;
}

/**
 * Walks `root` from the stream position. Returns the matched term and its length, or null. `tail`
 * is checked against the first character that leaves the trie, mirroring the reference's rule that
 * a keyword must not be followed by a name character and an operator not by an operator character.
 */
function matchTrie(
  input: InputStream,
  root: TrieNode,
  tail: (ch: number) => boolean,
): { term: number; length: number } | null {
  let node = root;
  let offset = 0;
  for (;;) {
    const ch = input.peek(offset);
    if (ch < 0) break; // Lexer.scala:427 — EOF ends the walk and accepts the node's token.
    const child = node.next.get(ch);
    if (!child) {
      if (!tail(ch)) return null;
      break;
    }
    node = child;
    offset++;
  }
  return node.term < 0 ? null : { term: node.term, length: offset };
}

/** Lexer.scala:140 — consumed no matter which character follows. */
const SIMPLE_TOKENS = trie([
  ["#", Hash],
  ["#(", HashParenL],
  ["#{", HashCurlyL],
  ["#|", HashBar],
  ["(", ParenL],
  [")", ParenR],
  [",", Comma],
  [";", Semi],
  ["???", HoleAnonymous],
  ["[", BracketL],
  ["\\", Backslash],
  ["]", BracketR],
  ["`", Tick],
  ["{", CurlyL],
  ["|#", BarHash],
  ["}", CurlyR],
  ["~", Tilde],
]);

/** Lexer.scala:165 — consumed only when no operator character follows. */
const OPERATORS = trie([
  ["!", Bang],
  ["!=", BangEqual],
  ["&", Ampersand],
  ["*", Star],
  ["+", Plus],
  ["-", Minus],
  [":", Colon],
  [":-", ColonMinus],
  ["::", ColonColon],
  [":::", ColonColonColon],
  ["<", AngleL],
  ["<+>", AngledPlus],
  ["<-", ArrowThinL],
  ["<=", AngleLEqual],
  ["<=>", AngledEqual],
  ["=", Equal],
  ["==", EqualEqual],
  ["=>", ArrowThickR],
  [">", AngleR],
  [">=", AngleREqual],
  ["^", Caret],
  ["|", Bar],
]);

const alwaysTail = () => true;
const notUserOp = (ch: number) => !isUserOp(ch);

/**
 * Punctuation, fixed operators, user-defined operators, the two arrows and the two dots:
 * `Lexer.scanToken` (Lexer.scala:291) minus the branches that are plain regular expressions and
 * live in `@tokens` instead.
 */
export const coreTokens = new ExternalTokenizer((input) => {
  const simple = matchTrie(input, SIMPLE_TOKENS, alwaysTail);
  if (simple) {
    input.advance(simple.length);
    input.acceptToken(simple.term);
    return;
  }

  const operator = matchTrie(input, OPERATORS, notUserOp);
  if (operator) {
    input.advance(operator.length);
    input.acceptToken(operator.term);
    return;
  }

  switch (input.next) {
    case Ch.Dot: {
      // Lexer.scala:314 — a dot with a space in front of it is an error the reference reports as
      // FreeDot; declining here leaves it to Lezer's error recovery.
      const before = input.peek(-1);
      if (before >= 0 && isWhitespace(before)) return;
      const after = input.peek(1);
      input.advance();
      // Lexer.scala:318 — a dot with trailing space terminates a Datalog constraint; without it,
      // the dot separates the segments of a qualified name.
      input.acceptToken(after >= 0 && isWhitespace(after) ? DotWhiteSpace : Dot);
      return;
    }

    case Ch.Minus: {
      // Lexer.scala:351 — `->` is an arrow only when no operator character follows the `>`, and
      // whitespace on either side decides struct access (`a->b`) from the function arrow. Reached
      // only when the operator trie already refused, which means an operator character follows, so
      // anything that is not an arrow is a user-defined operator.
      if (input.peek(1) !== Ch.Gt) break;
      const afterArrow = input.peek(2);
      if (afterArrow >= 0 && isUserOp(afterArrow)) break;
      const before = input.peek(-1);
      const spaced =
        before < 0 || isWhitespace(before) || afterArrow < 0 || isWhitespace(afterArrow);
      input.advance(2);
      input.acceptToken(spaced ? ArrowThinRWhitespace : ArrowThinRTight);
      return;
    }

    case Ch.Dollar: {
      // Lexer.scala:328 — `$name` is an escaped name and belongs to `@tokens`; `$` followed by an
      // operator character starts a user-defined operator; `$` alone is itself.
      const after = input.peek(1);
      if (after >= 0 && isLetter(after)) return;
      if (after >= 0 && isUserOp(after)) break;
      input.advance();
      input.acceptToken(Dollar);
      return;
    }

    case Ch.Underscore: {
      // Lexer.scala:374 — a leading underscore folds into a user-defined operator.
      const after = input.peek(1);
      if (!(after >= 0 && isUserOp(after))) return;
      input.advance();
      break;
    }

    case Ch.Slash:
      // Lexer.scala:338 — comments are taken by `commentTokens`, which runs first.
      input.advance();
      input.acceptToken(Slash);
      return;

    default:
      break;
  }

  // Lexer.scala:529 — a user-defined operator is a maximal run of operator characters.
  if (!isUserOp(input.next)) return;
  do input.advance();
  while (isUserOp(input.next));
  input.acceptToken(GenericOperator);
});

/**
 * Lexer.scala:872 and 883 — line and doc comments are regular, but block comments nest, so the
 * whole family lives here to keep the `/` dispatch in one place.
 */
export const commentTokens = new ExternalTokenizer((input) => {
  // `input.next` is a property, and TypeScript keeps whatever a guard narrowed it to across the
  // `advance()` calls that change it — after the guard below, every later `input.next` is typed as
  // `Ch.Slash`, so the comparisons stop meaning anything and one of them is rejected outright.
  // Reading the current character through `at()` keeps each read typed as what it is.
  const at = (): number => input.next;

  if (at() !== Ch.Slash) return;

  if (input.peek(1) === Ch.Slash) {
    input.advance(2);
    // A doc comment is exactly three slashes: `//` is a line comment, `////` is one again.
    let slashes = 0;
    while (at() === Ch.Slash) {
      slashes++;
      input.advance();
    }
    while (at() >= 0 && at() !== Ch.Newline) input.advance();
    input.acceptToken(slashes === 1 ? CommentDoc : CommentLine);
    return;
  }

  if (input.peek(1) !== Ch.Star) return;
  input.advance(2);
  let level = 1;
  while (at() >= 0) {
    if (at() === Ch.Slash && input.peek(1) === Ch.Star) {
      input.advance(2);
      level++;
    } else if (at() === Ch.Star && input.peek(1) === Ch.Slash) {
      input.advance(2);
      if (--level === 0) {
        input.acceptToken(CommentBlock);
        return;
      }
    } else {
      input.advance();
    }
  }
  // Unterminated. The reference produces an error token covering the rest of the file; accepting
  // a comment here would instead swallow the file and report a clean parse, so decline.
});

/**
 * Scans a string body from just after its opening delimiter, stopping at the closing quote or at
 * an interpolation hole. Transliterates `Lexer.acceptString` (Lexer.scala:556).
 *
 * @returns the term to accept, or -1 when the string is unterminated.
 */
function scanStringBody(input: InputStream): number {
  for (;;) {
    // Lexer.scala:459 — `\X` pairs, so neither `\"` nor `\$` ends anything.
    let escaped = false;
    while (input.next === Ch.Backslash) {
      input.advance(2);
      escaped = true;
    }
    if (input.next < 0) return -1;
    // Lexer.scala:567 — an unescaped `${` opens an interpolation hole.
    if (!escaped && input.peek(-1) === Ch.Dollar && input.next === Ch.CurlyL) {
      input.advance();
      return LiteralStringInterpolationL;
    }
    if (input.next === Ch.Quote) {
      input.advance();
      return LiteralString;
    }
    // Lexer.scala:588 — a newline inside a string is unterminated, unlike inside a regex.
    if (input.next === Ch.Newline) return -1;
    input.advance();
  }
}

/**
 * String literals, the segments an interpolated string is cut into, and the `d` of a debug
 * interpolation.
 *
 * The reference lexer resolves the `}` that resumes a string with its own nesting counter
 * (Lexer.scala:611). Lezer instead only consults this tokenizer in states where a resumption is
 * grammatically possible, so a `}` closing a block inside a hole is never offered here.
 */
export const stringTokens = new ExternalTokenizer((input) => {
  if (input.next === Ch.Quote) {
    input.advance();
    const term = scanStringBody(input);
    if (term >= 0) input.acceptToken(term);
    return;
  }

  if (input.next === Ch.CurlyR) {
    input.advance();
    const term = scanStringBody(input);
    // Resuming, the closing quote ends the whole literal rather than starting one.
    if (term === LiteralString) input.acceptToken(LiteralStringInterpolationR);
    else if (term >= 0) input.acceptToken(term);
    return;
  }

  // Lexer.scala:311 — `d` is the debug interpolator only when a quote follows immediately.
  if (input.next === Ch.LowerD && input.peek(1) === Ch.Quote) {
    input.advance();
    input.acceptToken(DebugInterpolator);
  }
});

/**
 * Advances `offset` past whitespace, line and doc comments, and nested block comments — the trivia
 * `@skip` removes for the parser but that a raw character scan has to step over itself. Returns
 * the offset of the first character that is not trivia, or -1 if the input ends inside it.
 */
function skipTrivia(input: InputStream, offset: number, limit: number): number {
  for (;;) {
    if (offset >= limit) return -1;
    const ch = input.peek(offset);
    if (ch < 0) return -1;
    if (isWhitespace(ch)) {
      offset++;
      continue;
    }
    if (ch !== Ch.Slash) return offset;
    const after = input.peek(offset + 1);
    if (after === Ch.Slash) {
      offset += 2;
      while (offset < limit && input.peek(offset) >= 0 && input.peek(offset) !== Ch.Newline) {
        offset++;
      }
      continue;
    }
    if (after !== Ch.Star) return offset;
    let level = 1;
    offset += 2;
    while (offset < limit && level > 0) {
      const c = input.peek(offset);
      if (c < 0) return -1;
      if (c === Ch.Slash && input.peek(offset + 1) === Ch.Star) {
        level++;
        offset += 2;
      } else if (c === Ch.Star && input.peek(offset + 1) === Ch.Slash) {
        level--;
        offset += 2;
      } else offset++;
    }
    if (level > 0) return -1;
  }
}

/**
 * A zero-width token emitted where a lambda head begins.
 *
 * `(a, b) -> e` and `(a, b)` share an unbounded prefix, and so do `match p -> e` and
 * `match e { ... }`. The reference parser resolves both by scanning forward for the arrow
 * (Parser2.scala:2037 and 2317); LR(1) cannot, and expressing it as an ambiguity instead makes the
 * parser split at every identifier, which costs more states than the whole rest of the grammar.
 *
 * So the lookahead the reference already performs is performed here, once, and its answer is
 * handed to the parser as a token only the lambda rules can shift. The scan is bounded by
 * `MAX_LOOKAHEAD`; a head longer than that is read as an expression, which is the reading the
 * parser would have reached anyway if no arrow followed.
 */
const MAX_LOOKAHEAD = 8192;

function scanForLambdaHead(input: InputStream, term: number, complexHead: boolean): void {
  // A lambda's head is `(params)` or a single name (Parser2.scala:2037 and 2159). A match
  // lambda's is a whole pattern, which may be a tag applied to arguments (detectMatchLambda,
  // Parser2.scala:2317). Without that distinction the lambda scan fires on the `match` of
  // `match (a, b) -> a + b`, whose head is a keyword and can be no lambda at all.
  if (!complexHead && input.next !== Ch.ParenL) {
    let offset = 0;
    if (input.peek(0) === Ch.Underscore || input.peek(0) === Ch.Dollar) offset++;
    if (!isLetter(input.peek(offset)) && !isMathName(input.peek(offset))) return;
    while (isNameChar(input.peek(offset)) || isMathName(input.peek(offset))) offset++;
    const at = skipTrivia(input, offset, MAX_LOOKAHEAD);
    if (at < 0) return;
    if (input.peek(at) !== Ch.Minus || input.peek(at + 1) !== Ch.Gt) return;
    const after = input.peek(at + 2);
    if (after >= 0 && isUserOp(after)) return;
    // Only the spaced arrow forms a lambda; `a->b` is struct field access.
    const before = input.peek(at - 1);
    if (!(before < 0 || isWhitespace(before) || after < 0 || isWhitespace(after))) return;
    input.acceptToken(term, 0);
    return;
  }

  const first = input.next;
  const opensGroup = first === Ch.ParenL;
  if (!opensGroup && !isLetter(first) && first !== Ch.Underscore && !isMathName(first)) return;

  let depth = 0;
  for (let offset = 0; offset < MAX_LOOKAHEAD; offset++) {
    const ch = input.peek(offset);
    if (ch < 0) return;
    switch (ch) {
      case Ch.CurlyL:
        // A brace at the top level ends the head: `match x { ... }` is not a lambda.
        if (depth === 0) return;
        depth++;
        continue;
      case Ch.ParenL:
      case Ch.BracketL:
        depth++;
        continue;
      case Ch.BracketR:
      case Ch.CurlyR:
        if (depth === 0) return;
        depth--;
        continue;
      case Ch.ParenR:
        if (depth === 0) return;
        depth--;
        continue;
      case Ch.Quote:
      case Ch.Apostrophe: {
        // Skip the literal wholesale so a bracket inside it cannot move the depth.
        const closer = ch;
        let i = offset + 1;
        for (; i < MAX_LOOKAHEAD; i++) {
          const c = input.peek(i);
          if (c < 0) return;
          if (c === Ch.Backslash) i++;
          else if (c === closer) break;
        }
        offset = i;
        continue;
      }
      case Ch.Slash: {
        const after = input.peek(offset + 1);
        if (after !== Ch.Slash && after !== Ch.Star) continue;
        const next = skipTrivia(input, offset, MAX_LOOKAHEAD);
        if (next < 0) return;
        offset = next - 1;
        continue;
      }
      case Ch.Minus: {
        if (depth !== 0 || input.peek(offset + 1) !== Ch.Gt) continue;
        const afterArrow = input.peek(offset + 2);
        if (afterArrow >= 0 && isUserOp(afterArrow)) continue;
        // Only the spaced arrow forms a lambda; `a->b` is struct field access.
        const before = input.peek(offset - 1);
        const spaced =
          before < 0 || isWhitespace(before) || afterArrow < 0 || isWhitespace(afterArrow);
        if (!spaced) continue;
        input.acceptToken(term, 0);
        return;
      }
      default:
        // At the top level these end the candidate head before any arrow could belong to it.
        if (depth === 0 && (ch === Ch.Comma || ch === Ch.Semi || ch === Ch.Equal)) return;
        continue;
    }
  }
}

export const lambdaAheadToken = new ExternalTokenizer((input) => {
  scanForLambdaHead(input, lambdaAhead, false);
});

/**
 * The same answer, in the one state where it means something else: directly after `match` or
 * `ematch`, a lambda head makes the whole construct a match lambda rather than a match over a
 * lambda. This tokenizer is declared first, so its token wins wherever both are valid — which is
 * the choice `Parser2.detectMatchLambda` (Parser2.scala:2317) makes too.
 */
export const matchLambdaAheadToken = new ExternalTokenizer((input) => {
  scanForLambdaHead(input, matchLambdaAhead, true);
});

export const fixpointCommaAheadToken = new ExternalTokenizer((input) => {
  if (input.next !== Ch.Comma) return;
  const at = skipTrivia(input, 1, MAX_LOOKAHEAD);
  if (at < 0) return;
  const ch = input.peek(at);
  // Every character a `fixpointOperand` can start with, and nothing else. Firing where no operand
  // can follow is not harmless: this tokenizer is consulted before `coreTokens`, so a token the
  // parser cannot use costs the plain `Comma` reading rather than falling through to it.
  const opensOperand =
    isLetter(ch) || // ExprQName
    ch === Ch.Underscore ||
    ch === Ch.Dollar ||
    isMathName(ch) ||
    ch === Ch.ParenL || // ExprParen
    ch === Ch.CurlyL || // ExprBlock
    (ch === Ch.Hash && input.peek(at + 1) === Ch.CurlyL); // ExprFixpointConstraintSet
  if (opensOperand) input.acceptToken(fixpointCommaAhead, 0);
});
