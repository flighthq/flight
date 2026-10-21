# flight-text-markup

The meaning layer of `htmlText`-subset markup: an open tag registry, the standard dialect, the
opt-in CSS named-color table, caller-owned class styles, and the parser's opt-in diagnostic seam.

The parser and formatter (`textMarkup.ts`) are here too: `parse_text_markup`, `format_text_markup` and
`explain_text_markup` port the pinned algorithms over the canonical `RichTextContent` /
`TextFormatRange` lane, including entities, attribute parsing, href sanitizing, the format stack,
implicit block breaks, overlapping-range precedence and the serialize/parse fixed point.

- `MarkupTagRegistry` is an ordered, case-insensitive, last-write-wins tag table with live resolver
  seams. `register_standard_markup_tags` installs the 14-tag `htmlText` dialect and the hex-only
  color seam; `register_markup_named_colors` opts into the CSS table; `register_markup_class_styles`
  installs a caller-owned live class map.
- Handlers are pure `Arc` callbacks over a decoded attribute `Record` and the enclosing `TextFormat`;
  they return a bare format contribution or a structural effect (`break_before`/`text`), the Rust
  closed form of the source's structurally detected union.
- Guard, log state and clock are caller-owned explicit context (D5); no module globals. The source's
  memoized default registry becomes a registry built per parse: the dialect is identical and its
  identity is unobservable.
- Adaptations: handler results are the explicit `MarkupTagResult` union (the source distinguishes the
  two shapes structurally); an entity that decodes to a lone surrogate is left verbatim because a Rust
  `String` cannot contain one; a format boundary that falls inside a UTF-16 surrogate pair cannot be
  sliced (offsets are otherwise UTF-16 code units, as in the source).
