# Depth Review: @flighthq/text

**Domain:** Text display objects — the Flash/OpenFL `TextField` family as scene-graph entities (single-format label, multi-format/HTML rich text, and platform-native text), exposed as plain entity + runtime + free functions.

**Verdict:** solid — 72/100

The verdict is deliberately scoped to what _this_ package is chartered to own. Per the codebase map, `@flighthq/text` is the **display-object layer** for text: it owns the `TextLabel`, `RichText`, and `NativeText` entities and their field-level mutators, and it delegates the actual text engine (glyph layout, line/paragraph metrics, hit testing, selection geometry, HTML parsing) to `@flighthq/textlayout`, editing to `@flighthq/textinput`, and shaping to `@flighthq/textshaper`. Judged as "an authoritative text _display-object_ layer," it is well-built and close to complete. Judged against the popular conflation of "a text library" with "a text _engine_," much of the expected surface is by-design elsewhere; the score reflects the entity-layer charter, with explicit notes where a gap is omission rather than delegation.

## Present capabilities

Only four source files, but the entity coverage is deliberate and the OpenFL field model is faithful.

- **Three entity families, each with the full create/data/runtime quartet:**
  - `TextLabel` — `createTextLabel`, `createTextLabelData`, `createTextLabelRuntime`, `getTextLabelRuntime`. Single-format field; lays out its whole string with one `TextFormat` range and no wrap (the lean path).
  - `RichText` — `createRichText`, `createRichTextData`, `createRichTextRuntime`, `getRichTextRuntime`. Multi-format/HTML field built on the layout spine, with cached `richTextContent`, selection indices, and a nullable `input` slot for opt-in editing.
  - `NativeText` — `createNativeText`, `createNativeTextData`, `createNativeTextRuntime`, `getNativeTextRuntime`. Platform-rendered field measured outside the spine (DOM writes `measuredWidth`/`measuredHeight` back onto the runtime), correctly opting out of `ensureTextLayout`.
- **Field-level mutators with invalidation discipline:** `setTextLabelString/Format/Width/Height/AutoSize`, `setRichTextString/FormatRange/ScrollH/ScrollV`, `clearRichTextFormatRanges`, `setNativeTextString/Style/Width/Height/AutoSize`. Each diffs the value, bumps `invalidateNodeLocalContent`, and conditionally `invalidateNodeLocalBounds` (bounds only re-invalidate under autoSize for RichText — a correct, considered detail).
- **AutoSize bounds model:** `computeTextLabelLocalBoundsRectangle`, `computeRichTextLocalBoundsRectangle`, `computeNativeTextLocalBoundsRectangle` implement the Flash anchor model (`none`/`left`/`right`/`center`), lazily ensuring layout so bounds are queryable before first render, with a fixed-box fallback before a measure provider is registered.
- **Lazy layout cache plumbing:** `ensureTextLayout` / `getTextLayout` / `getTextLayoutMetrics` mirror the node graph's `ensure*` pattern — revision-stamped, idempotent, render-pass-free, and per-kind via the `buildTextLayoutParams` runtime seam (the single difference between label and rich text).
- **OpenFL-canonical `TextFormat` model** (in `@flighthq/types`): align (incl. justify/start/end), bold, italic, underline, strikethrough, color, font, size, kerning, letterSpacing, leading, indent/blockIndent, left/rightMargin, bullet, tabStops, url/target. This is the full classic field-format vocabulary.
- **Scroll model:** `setRichTextScrollH/V` with `maxScrollH/V` clamping and `dispatchRichTextWheel`, matching `TextField.scrollH/scrollV/maxScrollH/maxScrollV/mouseWheelEnabled`.
- **Password seam:** `getRichTextPasswordCharacter` reads masking off the editable-input slot, keeping a static `RichText` mask-free and password state out of `RichTextData`.

## Gaps vs an authoritative text library

Split into **by-design delegation** (not this package's job) and **genuine omissions**.

By-design (lives in sibling packages, correctly out of scope here — _not_ counted against the score):

- Glyph layout, line breaking, line/paragraph metrics, char-index-at-point, selection rectangles, `getRichTextLineMetrics`, scroll-offset math — all in `@flighthq/textlayout`.
- Caret, selection, editing, key handling, restriction/maxChars enforcement — `@flighthq/textinput`.
- Shaping / measure provider (kerning, ligatures, bidi, complex scripts) — `@flighthq/textshaper` + `@flighthq/textlayout`'s measure provider seam.
- Per-backend rasterization (`drawCanvasTextLabel`, `drawGlRichText`, etc.) — the renderer packages.

Genuine omissions / thin spots at the entity layer:

- **No format-query/read accessors.** There are setters (`setRichTextFormatRange`, `setTextLabelFormat`) but no `getTextLabelFormat`, `getRichTextFormatRangeAt(index)`, or `getRichTextDefaultTextFormat`. OpenFL's `getTextFormat(beginIndex, endIndex)` / `setTextFormat` pair is asymmetric here — you can write ranges but not read the effective format at a position from this package.
- **`htmlText` is a stored field but has no setter** (`setRichTextHtml`/`getRichTextHtml`). `setRichTextString` sets `text`; `htmlText`, `styleSheet`, `condenseWhite`, `defaultTextFormat`, `background`/`backgroundColor`, `border`/`borderColor`, `textColor`, `maxChars`, `multiline`, `wordWrap`, `selectable`, `mouseWheelEnabled` are all initialized in `createRichTextData` but have **no mutator functions** — they can only be set at creation or by reaching into `source.data` directly. For an authoritative field, the canonical OpenFL setters (`background`, `border`, `wordWrap`, `multiline`, `selectable`, `maxChars`, …) should each have a `setRichText*` with invalidation, matching the symmetry the string/scroll/format setters already establish.
- **No `appendRichTextString` / `insertRichTextString`.** OpenFL `appendText` is a common field operation absent here (editing append lives in textinput, but a non-editable append on the field itself is reasonable).
- **No char-count / length helpers** (`getRichTextLength`, `getRichTextCharIndexAtPoint` is in textlayout but no entity-level convenience).
- (Confirmed not a gap: `RichTextData` is a first-class interface in `@flighthq/types/RichText.ts`, extending `TextLabelData`, with `scrollH`/`scrollV` marked `readonly` — which is why `internal.ts` casts to write them.)

## Naming / API-shape notes

- Naming is consistent and self-identifying: every function carries the full type word (`TextLabel`/`RichText`/`NativeText`), `create*`/`get*`/`set*`/`compute*`/`ensure*` verbs are used correctly, and out-parameter bounds functions follow the `compute*LocalBoundsRectangle(out, source)` convention.
- The package name `text` is broad relative to its actual charter (display-object entities only). This is the intended split per the map, but a reader importing `@flighthq/text` expecting a text _engine_ will find the layout/shaping/editing surface is elsewhere. The map documents this; the asymmetry is real but deliberate.
- The setter coverage is the main API-shape inconsistency: a few fields (string, format range, scroll, autoSize) have first-class mutators while the majority of `RichTextData` fields have none. Either all field setters should exist (the AAA-completeness expectation) or the package should document that direct `data` mutation + `invalidateNodeLocalContent` is the supported path. Right now it is half-and-half.
- `internal.ts` casts `RichTextData` to `RichTextDataInternal` to write `scrollH`/`scrollV` as read-only externally — the legacy `internal.ts` pattern the map flags as "do not extend; prefer runtime slots." Minor, but a candidate for migration.

## Recommendation

Treat as **solid, finish the entity surface to authoritative.** The architecture is right and the hard parts are correctly delegated; the package is let down only by an incomplete mutator surface. Concrete next steps, all within this package's scope:

1. Add the missing `setRichText*` field mutators with invalidation: `Background`, `BackgroundColor`, `Border`, `BorderColor`, `WordWrap`, `Multiline`, `Selectable`, `MaxChars`, `MouseWheelEnabled`, `Html`, `StyleSheet`, `CondenseWhite`, `DefaultTextFormat`, `TextColor`. This is the single biggest gap to AAA completeness.
2. Add read accessors to restore OpenFL symmetry: `getTextLabelFormat`, `getRichTextHtml`, `getRichTextDefaultTextFormat`, a `getRichTextLength` convenience, and an effective-format-at-index reader.
3. Consider `appendRichTextString` for the non-editing append case.
4. Migrate the `internal.ts` `scrollH`/`scrollV` write-cast to a convention consistent with the map (runtime slot or first-class mutable handling) rather than the legacy `internal.ts` pattern.

None of these require cross-package work; they are field-level additions on entities this package already owns. With the full setter/getter surface in place, this would be an authoritative text-display-object layer.
