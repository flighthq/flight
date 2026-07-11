---
package: '@flighthq/text-markup'
crate: flighthq-text-markup
draft: false
lastDirection: 2026-07-11
review: ./review.md
assessment: ./assessment.md
status: ./status.md
---

# text-markup — Charter

## What it is

`@flighthq/text-markup` is the **styled-text markup codec** — the explicit, Flight-way realization of OpenFL/Flash **`htmlText`**. It parses an HTML subset (the OpenFL `htmlText` tag set) into Flight's rich-text data model — a `RichTextContent` plus its `TextFormatRange[]` — which the existing `RichText`/`TextLabel` display nodes already render. A codec neighbor of `@flighthq/textlayout`'s rich-text model, matching `path-formats`/`shape-formats` (markup string ↔ rich-text data).

It replaces OpenFL's **`textField.htmlText = "…"` magic property** (assign markup, the runtime silently parses + applies it) with an **explicit function you call** — `parseTextMarkup(html)` → data you then hand to a text node. That property is an anti-goal (implicit runtime application, see [anti-goals](../anti-goals.md)); this codec is the sanctioned explicit path.

## North star

`parseTextMarkup(html, options?): RichTextContent` — parse the OpenFL `htmlText` subset into the plain text + `TextFormatRange[]` the rich-text model uses, and `formatTextMarkup(content): string` — serialize back (round-trip for the modeled tags). Supported tags (the OpenFL set): `<b>`, `<i>`, `<u>`, `<font color size face>`, `<a href target>`, `<p align>`, `<br>`, `<span class>`, `<li>`, `<textformat leftmargin blockindent …>`, `<img>` (as a placeholder ref). Entities (`&amp;` `&lt;` `&gt;` `&quot;` `&apos;` `&#nn;`) decode. Malformed markup → best-effort recovery (mirror how browsers/OpenFL are lenient), never throw. The output feeds `RichText` directly — no new display node.

## Boundaries

- **A codec over the rich-text model, not a display node.** It turns markup into `RichTextContent`/`TextFormatRange` data and back; it does NOT render, lay out, or own a node. Deps: `@flighthq/textlayout` (the `RichTextContent`/format-range model + `createRichTextContent`) + `@flighthq/types`.
- **Explicit parse, never a property.** No `htmlText`-style setter that the runtime applies; the app calls `parseTextMarkup` and assigns the result. This is the whole point — the anti-magic replacement for `.htmlText`.
- **HTML subset, not a real HTML engine.** The OpenFL `htmlText` tag/attribute set only; unknown tags are dropped (text kept) or passed through per a documented rule. No CSS, no layout tags beyond the OpenFL set.

## Decisions

_Append-only, dated, blessed rulings._

- **[2026-07-11] HTML subset (OpenFL `htmlText`), blessed by the user.** The dialect is the OpenFL/Flash `htmlText` tag set (not BBCode, not a Flight-native syntax) — the faithful, migration-friendly choice for the OpenFL feature target.
- **[2026-07-11] Explicit codec replaces the `.htmlText` property.** The magic setter is an anti-goal; `parseTextMarkup`/`formatTextMarkup` are the explicit path an app invokes. Add the `htmlText`-property entry to `anti-goals.md`.
- **[2026-07-11] Produces the existing rich-text model.** Output is `RichTextContent` + `TextFormatRange[]` consumed by the current `RichText` node — no new node, no model change; if a needed style has no `TextFormatRange` field, that is a `textlayout` model gap to raise, not a text-markup invention.

## Open directions

1. **BBCode / native-tag neighbors.** If a lighter or Flight-native markup is later wanted, a sibling codec over the SAME rich-text model (the dialect is swappable; the target model is fixed).
2. **`<img>` resource resolution.** Inline-image tags resolved via a caller-supplied resolver (the reference-then-resolve pattern of `shape-formats`), once inline images are modeled in rich text.
3. **Sanitization guard.** An `enable*Guards` diagnostic for unknown/dropped tags + unsafe `href` schemes, per the diagnostics inversion rule.
