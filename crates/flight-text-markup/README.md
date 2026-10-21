# flight-text-markup

The meaning layer of `htmlText`-subset markup: an open tag registry, the standard dialect, the
opt-in CSS named-color table, caller-owned class styles, and the parser's opt-in diagnostic seam.

The parser and formatter (`textMarkup.ts`) are not in this crate yet: they require the canonical
`createRichTextContent` / `initializeRichTextContent` API from the text-owned lower lane, which is
landing separately. Everything the parser composes over is here and tested directly.

- `MarkupTagRegistry` is an ordered, case-insensitive, last-write-wins tag table with live resolver
  seams. `register_standard_markup_tags` installs the 14-tag `htmlText` dialect and the hex-only
  color seam; `register_markup_named_colors` opts into the CSS table; `register_markup_class_styles`
  installs a caller-owned live class map.
- Handlers are pure `Arc` callbacks over a decoded attribute `Record` and the enclosing `TextFormat`;
  they return a bare format contribution or a structural effect (`break_before`/`text`), the Rust
  closed form of the source's structurally detected union.
- Guard, log state and clock are caller-owned explicit context (D5); no module globals.
