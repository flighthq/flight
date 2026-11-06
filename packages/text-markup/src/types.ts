import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import type { EntityRaw } from '@flighthq/entity/contract';
import type { TextFormat } from '@flighthq/textformat/contract';

// Text-markup declarations owned by this package's acyclic contract lane.
// Resolves a `<font color>` attribute value to a packed 24-bit RGB integer, or null when unrecognized.
// The color seam a `MarkupTagRegistry` carries and the standard `<font>` handler consults: the standard
// dialect installs a hex-only resolver (`#rgb`/`#rrggbb`/`0x`), and `registerMarkupNamedColors` swaps in
// one that also resolves the CSS named-color keywords. Keeping color parsing behind this seam is what
// lets the ~148-entry named-color table stay out of a bundle that never opts into it — only the named
// resolver imports the table, so a font handler restricted to hex never pulls it in.
export type MarkupColorResolver = (value: string) => number | null;

// Resolves a single `<span class>` token to the TextFormat fields that class contributes, or null when
// the class is unknown. The style seam a `MarkupTagRegistry` carries and the standard `<span>` handler
// consults: the standard dialect leaves it unset (a bare `<span>` is a transparent grouping element),
// and `registerMarkupClassStyles` installs one over a caller-provided class → format map. Keeping class
// styling behind this seam is what keeps a style table out of a bundle that never opts in — the map is
// the caller's own, never a built-in table, so span costs nothing until styles are registered.
export type MarkupClassResolver = (className: string) => Readonly<Partial<TextFormat>> | null;

// The contribution a markup tag makes when it opens. The common case is a plain `Partial<TextFormat>`
// (a formatting tag such as `<b>` or `<font color>`): the fields it names are merged onto the format
// stack for the tag's enclosed text. The richer `MarkupTagEffect` shape covers the few structural
// tags whose meaning is not purely formatting — a `<br>` that inserts literal text, or a `<p>`/`<li>`
// that both formats and forces a line break before its content.
//
// The two shapes are distinguished structurally: `MarkupTagEffect` carries one of the reserved keys
// `format`, `breakBefore`, or `text` (none of which is a `TextFormat` field), so a bare
// `Partial<TextFormat>` is never mistaken for an effect. Handlers stay pure and small — a handler
// never sees spans, ranges, or the surrounding text; the parser owns composition and the format
// stack, so a handler only maps this tag's attributes to its own contribution.
export type MarkupTagResult = Partial<TextFormat> | MarkupTagEffect;

export interface MarkupTagEffect {
  // Insert a collapsing line break before the tag's content (block tags: `<p>`, `<li>`). The break
  // is suppressed at the very start of the output and against an existing trailing newline, so block
  // tags never stack blank lines — this keeps the markup losslessly round-trippable.
  breakBefore?: boolean;
  // Format merged onto the stack for the tag's enclosed text. Absent for a pure insertion tag.
  format?: Partial<TextFormat>;
  // Literal text emitted in place of the tag (void insertion tags: `<br>` → `'\n'`). A result with
  // `text` and no `format` is treated as a void tag and never pushes a format frame.
  text?: string;
}

// Maps a tag's parsed, entity-decoded attributes and enclosing resolved format to its formatting or
// structural contribution. The enclosing format lets relative authoring values become absolute at the
// parse seam (`<font size="+2">`) while the stored TextFormat model stays context-free. Registered by
// lowercase tag name in a `MarkupTagRegistry`; the registered set is the supported dialect.
export type MarkupTagHandler = (
  attributes: Readonly<Record<string, string>>,
  enclosingFormat: Readonly<TextFormat>,
) => Readonly<MarkupTagResult>;

// The open tag-name → handler registry that gives markup its meaning. Parsing (structure) and meaning
// (tag → format) are separate layers: the parser tokenizes and composes the format stack, while this
// registry decides what each tag contributes. The registered set of tag names IS the supported
// dialect. Open and last-write-wins — a user registers their own (vendor-prefixed) tags, and unused
// standard tags tree-shake out when a custom registry is built instead of the standard one.
export interface MarkupTagRegistry {
  // The style seam the `<span>` handler consults for a `class` attribute. Unset on the standard dialect
  // (a `<span>` contributes nothing — a transparent grouping element); `registerMarkupClassStyles`
  // installs one over a caller-provided class → format map. A `class` naming several space-separated
  // classes merges each resolved contribution left to right. See MarkupClassResolver.
  classResolver?: MarkupClassResolver;
  // The color seam the `<font>` handler consults. `registerStandardMarkupTags` installs a hex-only
  // resolver; `registerMarkupNamedColors` swaps in one that also resolves CSS named colors. Left unset
  // on a bare registry, in which case the standard `<font>` handler falls back to hex-only parsing. This
  // is what keeps the named-color table out of a bundle that never opts into it — see MarkupColorResolver.
  colorResolver?: MarkupColorResolver;
  handlers: Map<string, MarkupTagHandler>;
}

export type TextMarkupIssueKind = 'unknown-tag' | 'unresolved-font-color' | 'unsafe-href';

// One lossy decision made by parseTextMarkup. The parse still succeeds; this record tells tooling
// exactly which token was ignored or sanitized without coupling the core parser to message strings.
export interface TextMarkupIssue {
  kind: TextMarkupIssueKind;
  offset: number;
  tag: string;
  value: string | null;
}

// Pull-style diagnostics for a markup parse. An empty issues array means every token the source used
// was represented by the selected registry and all guarded attribute values resolved safely.
export interface TextMarkupExplanation {
  issues: TextMarkupIssue[];
}

// Optional parser seam installed by enableTextMarkupGuards. Null is the production default.
export type TextMarkupGuard = (issue: Readonly<TextMarkupIssue>) => void;

export const TextMarkupIssueKind = {
  UnknownTag: 'unknown-tag',
  UnresolvedFontColor: 'unresolved-font-color',
  UnsafeHref: 'unsafe-href',
} as const;

// Rust carries these seams as explicit caller-owned state. They are package-internal TypeScript
// generation facts; the public target-native modules keep the established hidden-state signatures.
export interface MarkupResolverSeams {
  classResolver?: MarkupClassResolver;
  colorResolver?: MarkupColorResolver;
}

export type TextMarkupClock = () => number;

// Allocated as an entity so the caller-owned slot has a stable identity that a guard install and its
// later reads share.
export interface TextMarkupGuardState extends EntityRaw {
  guard?: TextMarkupGuard;
}

export function createTextMarkupGuardState(): TextMarkupGuardState {
  const out = allocateEntity<TextMarkupGuardState>();
  return finishEntity(out);
}

export function getTextMarkupIssueKindString(value: TextMarkupIssueKind): string {
  return value;
}

export function parseTextMarkupIssueKind(value: string): TextMarkupIssueKind | undefined {
  switch (value) {
    case 'unknown-tag':
    case 'unresolved-font-color':
    case 'unsafe-href':
      return value;
    default:
      return undefined;
  }
}
