// Maps this grammar's nodes onto @lezer/highlight tags.
//
// Every token here is named after its upstream `TokenKind` (docs/ARCHITECTURE.md §3), so most of
// this styles tokens directly rather than inferring a role from the parent node. Where the role
// does depend on position — a name being defined rather than referenced — the selector says so.

import { styleTags, tags as t } from "@lezer/highlight";

export const flixHighlighting = styleTags({
  // --- keywords, by what they do ------------------------------------------
  "KeywordDef KeywordRedef KeywordEnum KeywordStruct KeywordTrait KeywordInstance KeywordEff KeywordType KeywordAlias KeywordRestrictable":
    t.definitionKeyword,
  KeywordMod: t.moduleKeyword,
  "KeywordUse KeywordImport": t.moduleKeyword,
  "KeywordIf KeywordElse KeywordMatch KeywordEMatch KeywordCase KeywordForA KeywordForM KeywordForeach KeywordYield KeywordTry KeywordCatch KeywordThrow KeywordSelect KeywordSpawn KeywordPar KeywordRun KeywordWith KeywordHandler KeywordChoose KeywordChooseStar":
    t.controlKeyword,
  "KeywordAnd KeywordOr KeywordNot KeywordXor KeywordInstanceOf KeywordRvadd KeywordRvand KeywordRvnot KeywordRvsub KeywordDiscard KeywordForce KeywordLazy":
    t.operatorKeyword,
  "KeywordPub KeywordSealed KeywordMut": t.modifier,
  "KeywordTrue KeywordFalse": t.bool,
  KeywordNull: t.null,
  "KeywordLet KeywordRegion KeywordNew KeywordSuper KeywordStaticLowercase KeywordStaticUppercase KeywordUniv KeywordWhere KeywordFrom KeywordInto KeywordProject KeywordSolve KeywordPSolve KeywordQuery KeywordPQuery KeywordInject KeywordFix KeywordForall KeywordOpenVariant KeywordOpenVariantAs KeywordXvar KeywordUnsafe KeywordCheckedCast KeywordCheckedECast KeywordUncheckedCast KeywordAs":
    t.keyword,
  "ArrayHash VectorHash ListHash SetHash MapHash": t.keyword,

  // --- names, by the position they appear in -------------------------------
  "DeclDef/Ident/NameLowercase DeclRedef/Ident/NameLowercase DeclSignature/Ident/NameLowercase DeclOp/Ident/NameLowercase ExprLocalDef/Ident/NameLowercase":
    t.definition(t.function(t.variableName)),
  "DeclDef/Ident/GenericOperator DeclRedef/Ident/GenericOperator DeclSignature/Ident/GenericOperator":
    t.definition(t.function(t.operator)),
  "DeclEnum/Ident DeclRestrictableEnum/Ident DeclStruct/Ident DeclTrait/Ident DeclEffect/Ident DeclTypeAlias/Ident DeclAssociatedTypeSig/Ident DeclAssociatedTypeDef/Ident":
    t.definition(t.typeName),
  "DeclModule/QName/Ident": t.definition(t.namespace),
  "Parameter/Ident TypeParameter/Ident": t.definition(t.variableName),
  "TypeName/Ident TypeVariable": t.typeName,
  "Case/Ident PatternTag/QName/Ident": t.tagName,
  "StructField/Ident TypeRecordField/Ident ExprRecordSelect/Ident ExprStructGet/Ident ExprStructPut/Ident ExprGetField/Ident PatternRecordLabelPattern/Ident ExprStructPutFieldInit/Ident":
    t.propertyName,
  "ExprInvokeMethod/Ident": t.function(t.propertyName),
  "PredicateHead/Ident PredicateAtom/Ident PredicateParam/Ident PredicateAndArity/Ident":
    t.labelName,
  NameUppercase: t.typeName,
  NameLowercase: t.variableName,
  NameMath: t.operator,
  Underscore: t.variableName,

  // --- literals ------------------------------------------------------------
  "LiteralInt LiteralInt8 LiteralInt16 LiteralInt32 LiteralInt64 LiteralBigInt": t.integer,
  "LiteralFloat LiteralFloat32 LiteralFloat64 LiteralBigDecimal": t.float,
  LiteralString: t.string,
  "LiteralStringInterpolationL LiteralStringInterpolationR": t.special(t.string),
  LiteralChar: t.character,
  LiteralRegex: t.regexp,
  DebugInterpolator: t.special(t.string),

  // --- comments, holes, annotations ----------------------------------------
  CommentLine: t.lineComment,
  CommentBlock: t.blockComment,
  CommentDoc: t.docComment,
  Annotation: t.annotation,
  BuiltIn: t.macroName,
  "HoleAnonymous HoleNamed HoleVariable": t.special(t.variableName),

  // --- operators and punctuation -------------------------------------------
  "Plus Minus Star Slash": t.arithmeticOperator,
  "AngleL AngleR AngleLEqual AngleREqual EqualEqual BangEqual AngledEqual": t.compareOperator,
  "ColonColon ColonColonColon AngledPlus GenericOperator Caret Ampersand Bar Tilde Bang Dollar":
    t.operator,
  "ArrowThinRWhitespace ArrowThinRTight ArrowThickR ArrowThinL": t.definitionOperator,
  Equal: t.definitionOperator,
  "Colon ColonMinus Backslash": t.typeOperator,
  "Comma Semi": t.separator,
  "Dot DotWhiteSpace": t.derefOperator,
  "ParenL ParenR": t.paren,
  "BracketL BracketR": t.squareBracket,
  "CurlyL CurlyR HashCurlyL": t.brace,
  "Hash HashParenL HashBar BarHash At Tick": t.punctuation,
});
