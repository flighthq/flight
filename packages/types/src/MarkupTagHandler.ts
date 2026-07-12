import type { TextFormat } from './TextFormat';

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

// Maps a tag's parsed, entity-decoded attributes to its formatting or structural contribution. Pure
// and self-contained: the same attributes always yield the same result, and the handler has no view
// of the document beyond its own tag. Registered by lowercase tag name in a `MarkupTagRegistry`; the
// registered set is the supported dialect.
export type MarkupTagHandler = (attributes: Readonly<Record<string, string>>) => Readonly<MarkupTagResult>;
