---
package: '@flighthq/text'
status: solid
score: 82
updated: 2026-06-24
ingested:
  - status.md
  - reviews/depth/text.md
  - source
  - changes.patch
---

# Review: @flighthq/text

Evidence: incoming bundle `builder-67dc46d64`. Source read from `67dc46d6:packages/text/src/`; delta from `changes.patch`; cross-package ripple verified in `packages/types/`, `packages/textlayout/`, and the renderer packages.

## Verdict

**solid — 82/100.** The entity surface this package is chartered to own (the `TextLabel` / `RichText` / `NativeText` field family, their mutators, accessors, autoSize bounds, and the lazy layout-cache seam) is now essentially complete and OpenFL-faithful — the depth review's biggest gap (a half-finished `RichText` mutator surface) is closed, and the work went _past_ its own status report by also landing signals, insert/replace, and the textlayout hit-test fix. Two real defects hold the score below authoritative: a **missing `@flighthq/signals` dependency** in `package.json` (`richText.ts` imports `createSignal` from it), and **six exported functions with no colocated tests** — both of which `npm run check` (`packages:check` / `exports:check`) would fail on as delivered.

The single most important meta-finding: **the status doc materially under-reports the diff.** It is AS-CLAIMED and now superseded — verify against this review, not status.md.

## Status-doc reconciliation (AS-CLAIMED → verified)

The worker report (72→88 claim) listed signals, insert/replace, and the textlayout bug as **deferred**. The diff refutes all three — they are _implemented_, not deferred:

- **Signals group is built, not deferred.** `@flighthq/types` gained `TextFieldChangeEvent`, `TextFieldLinkEvent`, `TextFieldScrollEvent`, `TextFieldSignals`; `RichTextRuntime` gained a `textFieldSignals` slot; `richText.ts` exports `enableTextFieldSignals`, `createTextFieldSignals`, `getTextFieldSignals`, `dispatchRichTextLinkAtPoint`, and emits change/scroll/link events from the setters. Status said this was "deferred to avoid a write conflict."
- **`insertRichTextString` / `replaceRichTextString` are implemented** with full format-range re-indexing (shift/extend/trim/remove on splice) — status said "deferred (non-trivial)."
- **The `textlayout` `richTextQuery.ts` bug status flagged is fixed in this same bundle.** The buggy `let lineStart = text.length` (referencing the param renamed to `_text`) is replaced with `layout.groups`-derived `lineStart`; both params are now genuinely `_text` (unused). The `y = 9999` test workaround the status mentions is no longer load-bearing.
- Renderer packages (`displayobject-canvas/dom/wgpu` RichText) were also touched in the bundle — partly the `enableCanvasTextInput*` rename and mask-contract comments, i.e. work outside this package's charter that rode along in the builder. Noted for the ingest, not scored here.

The status doc's "estimated 88/100" is plausible _for the feature delivery_, but it was written against a smaller delta than actually shipped and missed the two CI-breaking defects below.

## Present capabilities

Four source files; the entity coverage is now deliberate and close to AAA for a text _display-object_ layer.

- **Three entity quartets**, each with `create*` / `create*Data` / `create*Runtime` / `get*Runtime`: `TextLabel` (single-format, single-run lean path), `RichText` (multi-format/HTML on the layout spine, cached `richTextContent`, selection indices, nullable `input` editing slot, nullable `textFieldSignals` slot), and `NativeText` (platform-measured, opts out of the layout spine; DOM writes `measuredWidth/Height` back onto the runtime).
- **Full `RichText` field-mutator surface** (`richText.ts`, 52 exports): `setRichTextBackground/ BackgroundColor/Border/BorderColor/CondenseWhite/DefaultTextFormat/Height/Html/MaxChars/ MouseWheelEnabled/Multiline/ScrollH/ScrollV/Selectable/String/StyleSheet/TextColor/Width/ WordWrap`, each with diff-skip and the correct content-vs-bounds invalidation split (`invalidateRichTextContent` re-invalidates bounds only under autoSize). This closes the depth review's #1 gap.
- **Read accessors restoring OpenFL symmetry**: `getRichTextString/Html/Length/DefaultTextFormat`, `getTextLabelString/Format`, `getNativeTextString/Style/MeasuredWidth/MeasuredHeight`, and the effective-format-at-index reader `getRichTextFormatRangeAt(out, source, index)` (merges `defaultTextFormat` + overlapping ranges via `mergeTextFormat`).
- **Format-range introspection / editing**: `getRichTextFormatRangeCount`, `getRichTextFormatRangeByIndex`, `removeRichTextFormatRangesIn`, `clearRichTextFormatRanges`, `setRichTextFormatRange`, plus string editing `appendRichTextString` / `insertRichTextString` / `replaceRichTextString` with format-range re-indexing.
- **Entity-level metric conveniences** (the `*Value` family) wrapping `textlayout` after `ensureTextLayout`: `getRichTextLineCountValue`, `getRichTextTextWidthValue/TextHeightValue`, `getRichTextMaxScrollHValue/MaxScrollVValue/BottomScrollVValue`, `getRichTextLineMetricsValue`, `getRichTextCharIndexAtPointValue` — each returns a sentinel (`0`/`1`/`-1`/`null`) when no measure provider is registered. Correct sentinel discipline.
- **Lazy layout cache** (`textLabelLayout.ts`): `ensureTextLayout` / `getTextLayout` / `getTextLayoutMetrics`, revision-stamped, render-pass-free, per-kind via the `runtime.buildTextLayoutParams` seam (the one difference between label and rich text).
- **AutoSize bounds** for all three kinds via `compute*LocalBoundsRectangle(out, source)`, ensuring layout on demand with a fixed-box fallback before a measure provider exists.
- **Signals group** (opt-in): `enableTextFieldSignals` lazily creates the group; change/scroll emit from setters guarded on a non-null slot (zero cost when unused); `dispatchRichTextLinkAtPoint` fires `onTextFieldLink`. Matches the SDK signals convention (`enable*` in the owning package).
- **Password seam**: `getRichTextPasswordCharacter` reads masking off the editable-input slot, keeping a static `RichText` mask-free and password state out of `RichTextData`.

Tests: 149 (`richText` 91, `textLabel` 26, `nativeText` 25, `textLabelLayout` 7), every setter asserting both the diff-skip path and the invalidation bump.

## Gaps

Defects (CI-breaking as delivered):

- **Missing `@flighthq/signals` dependency.** `richText.ts:7` `import { createSignal } from '@flighthq/signals'`, but `packages/text/package.json` `dependencies` omits it (`displayobject`, `entity`, `geometry`, `node`, `textlayout`, `types` only). `packages:check` (workspace dependency conventions) would flag this; the build only survives via hoisting.
- **Six exported functions with no colocated test** → `exports:check` failure. `richText.test.ts` has no `describe` for, and no reference to: `createTextFieldSignals`, `dispatchRichTextLinkAtPoint`, `enableTextFieldSignals`, `getTextFieldSignals`, `insertRichTextString`, `replaceRichTextString`. The signal-emission paths inside the setters are likewise unexercised (no test enables the group and asserts an emit). This is the load-bearing risk of the bundle: the most subtle new code (format-range re-indexing in insert/replace, link/scroll emission) is the least tested.

Thin spots / omissions at the entity layer (not defects, completeness):

- **`getRichTextFormatRangeByIndex`'s `out` parameter is an inline structural type** (`{ start: number; end: number; format: TextFormat }`) rather than the named `TextFormatRange` from `@flighthq/types`. The codebase-map rule is that cross-package shapes live in `types`; `TextFormatRange` already exists and is the correct annotation.
- **No `getRichTextFormatRangesIn(beginIndex, endIndex)`** OpenFL-style range read (the symmetric partner to `removeRichTextFormatRangesIn`); `getRichTextFormatRangeAt` covers single-index only.
- **`condenseWhite` / `styleSheet` are settable but not honored** — `setRichTextHtml`, `setRichTextCondenseWhite`, `setRichTextStyleSheet` set fields + invalidate, but the content-build (`computeRichTextContent` in `textlayout`) must actually consume them. By-design a `textlayout` responsibility, but the entity surface now _promises_ behavior the engine does not yet deliver — worth flagging so it does not read as silently working.
- **Functional/parity tests absent** — multi-format RichText, autoSize anchors, word-wrap reflow, scroll, links, NativeText measurement. jsdom unit tests cannot reach the render path; the entity surface is now complete enough to unblock these.

By-design delegation (correctly _not_ here, not scored against): glyph layout / line metrics / hit-test geometry (`textlayout`), caret/selection/editing (`textinput`), shaping/measure provider (`textshaper`), per-backend rasterization (renderer packages).

## Charter contradictions

The charter is a stub (What-it-is seeded from the depth review; North star / Boundaries / Decisions / Open directions all `TODO`). Nothing to contradict. The work is consistent with the _implied_ charter (display-object entity layer, delegating the engine). The `*Value` accessor family and the signals-group home are the two shape questions a real charter should rule on — surfaced below.

## Contract & docs fit

Lives up to the contract on most axes:

- **Types-first**: all new shapes (`TextField*Event`, `TextFieldSignals`) defined in `@flighthq/types`, one concept per file. Good — except the inline `out` literal noted above.
- **Naming**: full unabbreviated type words throughout (`getRichTextDefaultTextFormat`, not `getRTFmt`); `create*`/`get*`/`set*`/`compute*`/`ensure*`/`enable*`/`dispatch*` verbs used correctly; `dispatchRichTextLinkAtPoint` is the convenience-that-also-emits, distinct from `textlayout`'s pure `getRichTextLinkAtPoint`.
- **Sentinels not throws**: the `*Value` family returns `0`/`1`/`-1`/`null` for "no measure provider yet" rather than throwing. Correct.
- **Out-params**: `compute*LocalBoundsRectangle(out, source)` and `getRichTextFormatRangeAt(out, …)` follow the convention; `getRichTextFormatRangeAt` reads inputs before writing `out` (alias-safe).
- **`internal.ts` retired**: the legacy `RichTextDataInternal` cast is gone; `scrollH`/`scrollV` are now plain mutable fields on `RichTextData` (the `readonly` removed in `types/RichText.ts`). This is exactly the map's "do not extend `internal.ts`; prefer the proper shape" direction. The depth review's migration recommendation is satisfied.
- **Single root export, `sideEffects: false`**: both present and correct.

Contract violations: the **missing `signals` workspace dependency** (above) and the **untested exports** (above) are the two places the package does not currently satisfy `npm run check`.

Structural-forks fit: the `out`-literal in `getRichTextFormatRangeByIndex` is a small contract-fit drift (a cross-package shape defined inline rather than homed in `types`) — fork-adjacent (mis-homed type), low cost to fix. No closed-switch / hot-loop-inflation issues; the package has no dispatch loop. The signals-group seam follows fork D's runtime-backend pattern (opt-in `enable*`, nullable slot) correctly.

Candidate doc revisions: none required — the Package Map line for `@flighthq/text` still matches (it already names `TextLabel`/`RichText`/`NativeText` and the layout-spine relationship). The status.md entry should be marked **superseded** by this review (it under-claims the delivery).

## Candidate open directions (for the charter to settle)

1. **The `*Value` accessor family — keep, rename, or drop?** The suffix exists only to avoid name collision with the `textlayout` functions they wrap (`getRichTextLineCount` lives in both). The charter should decide whether `text` re-exposes layout metrics as entity conveniences at all, or whether users call `textlayout` directly after `ensureTextLayout`. (Raised by the worker too.)
2. **Where do HTML/`styleSheet` semantics live?** `setRichTextHtml`/`setRichTextStyleSheet` set fields the content-build does not yet honor. Is there a `@flighthq/text-formats` neighbor (an HTML/CSS parse seam, registry-dispatched like the shaper), or does `textlayout` own it? This is a structural-forks B/triad question (a `-formats` cell) that needs a plurality check before creation.
3. **Is the signals group correctly homed in `text`?** It is, per convention — but the charter should bless `TextFieldSignals` (change/link/scroll) as the canonical field-event set, and rule on whether a `selection`/`caret` event belongs here or in `textinput`.
4. **Append/insert/replace on a non-editable field — in scope?** These now exist on the static entity (editing proper lives in `textinput`). The charter should confirm the field owns programmatic text mutation while `textinput` owns _interactive_ editing, so the boundary is explicit rather than assumed.
5. **Rust mirror posture.** `flighthq-text` should wait until #1–#3 settle (they shape the final TS surface the port conforms to), per the worker's own note.
