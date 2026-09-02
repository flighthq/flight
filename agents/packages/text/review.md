---
package: '@flighthq/text'
status: solid
score: 82
updated: 2026-09-02
ingested:
  - charter.md
  - status.md
  - source
---

# Review: @flighthq/text

## Verdict

**solid -- 82/100.** The package delivers a well-shaped, thin entity layer for three text display-object families (TextLabel, RichText, NativeText), with complete setter/getter surfaces, correct invalidation, programmatic text mutation with format-range re-indexing, lazy layout caching, opt-in signals, and a diagnostics pair (guard + explain) for TextLabel. The charter is unusually thorough and the code conforms to it. The remaining gaps are the diagnostics asymmetry (RichText and NativeText lack guards/explain), object-reference setters that invalidate unconditionally, the unbounded-growth `setRichTextFormatRange` append behavior, and absent functional test coverage for stateful paths. No compilation or API-shape blockers.

## Present capabilities

### TextLabel (`textLabel.ts`, 171 lines; test 300 lines)

- **Entity lifecycle:** `createTextLabel`, `createTextLabelData`, `createTextLabelRuntime` -- all follow the `createNode2D` pattern with kind registration (`TextLabelKind`).
- **Full setter/getter surface:** `setTextLabelString`, `setTextLabelFormat`, `setTextLabelAutoSize`, `setTextLabelWidth`, `setTextLabelHeight`, `setTextLabelVerticalAlign`, `getTextLabelString`, `getTextLabelFormat`, `getTextLabelRuntime`. Every scalar setter diff-skips and applies the correct content-vs-bounds invalidation split (`invalidateTextLabelContent` bumps bounds only when `autoSize !== 'none'`).
- **Append:** `appendTextLabelString` with empty-value guard.
- **Bounds:** `computeTextLabelLocalBoundsRectangle` -- out-parameter, autoSize-aware, ensures layout on demand, falls back to fixed box when no measure provider is registered.
- **Layout params hook:** `buildTextLabelLayoutParams` (local, assigned onto runtime) -- single-run path that skips RichText's range/html assembly.

### RichText (`richText.ts`, 612 lines; test 1259 lines)

- **Entity lifecycle:** `createRichText`, `createRichTextData`, `createRichTextRuntime` -- RichTextData extends TextLabelData with background/border/scroll/format-range/multiline/wordWrap/selectable/textColor fields. Format ranges are shallow-copied on create to avoid aliasing.
- **Complete setter surface (~20 setters):** `setRichTextString`, `setRichTextContent`, `setRichTextDefaultTextFormat`, `setRichTextFormatRange`, `setRichTextBackground`, `setRichTextBackgroundColor`, `setRichTextBorder`, `setRichTextBorderColor`, `setRichTextCondenseWhite`, `setRichTextHeight`, `setRichTextWidth`, `setRichTextMaxChars`, `setRichTextMouseWheelEnabled`, `setRichTextMultiline`, `setRichTextScrollH`, `setRichTextScrollV`, `setRichTextSelectable`, `setRichTextTextColor`, `setRichTextVerticalAlign`, `setRichTextWordWrap`. All scalar setters diff-skip; object-reference setters (`setRichTextDefaultTextFormat`, `setRichTextContent`, `setRichTextFormatRange`) invalidate unconditionally (see Gaps).
- **Getter surface:** `getRichTextString`, `getRichTextLength`, `getRichTextDefaultTextFormat`, `getRichTextPasswordCharacter`, `getRichTextRuntime`, `getRichTextFormatRangeAt` (out-parameter, merges default + overlapping ranges), `getRichTextFormatRangeByIndex` (out-parameter, returns boolean sentinel), `getRichTextFormatRangeCount`, `getRichTextFormatRangesIn` (out array, half-open overlap test).
- **Metric convenience wrappers:** `getRichTextBottomScrollV`, `getRichTextCharIndexAtPoint`, `getRichTextLineCount`, `getRichTextLineMetrics`, `getRichTextMaxScrollH`, `getRichTextMaxScrollV`, `getRichTextTextHeight`, `getRichTextTextWidth` -- each calls `ensureTextLayout`, returns a typed sentinel (`0`, `1`, `-1`, or `null`) when no measure provider is registered.
- **Programmatic text mutation with format-range re-indexing:** `appendRichTextString`, `insertRichTextString` (shift + extend-straddle), `replaceRichTextString` (full five-branch case split: shift-after, leave-before, remove-inside, shrink-spanning, trim-left, trim-right). `clearRichTextFormatRanges`, `removeRichTextFormatRangesIn`.
- **Scroll dispatch:** `setRichTextScrollH`/`setRichTextScrollV` with clamping (0/1 minimum, optional max from layout), `dispatchRichTextWheel`.
- **Signals:** `enableTextFieldSignals` (idempotent `??=`), `getTextFieldSignals`, `createTextFieldSignals` -- three signals: `onTextFieldChange`, `onTextFieldLink`, `onTextFieldScroll`. Emission guarded on non-null slot. `dispatchRichTextLinkAtPoint` is the convenience entry that also fires the link signal.
- **Bounds:** `computeRichTextLocalBoundsRectangle` -- mirrors TextLabel's, delegating to `computeTextBoundsRectangle` from textlayout.
- **Layout params hook:** `buildRichTextLayoutParams` (exported, assigned onto runtime) -- assembles multi-format content via `computeRichTextContent` from textlayout, applies password masking, respects vertical alignment only for fixed-height boxes.

### NativeText (`nativeText.ts`, 144 lines; test 285 lines)

- **Entity lifecycle:** `createNativeText`, `createNativeTextData`, `createNativeTextRuntime` -- opts out of the TextLayout spine entirely. Bounds come from platform-renderer-written `measuredWidth`/`measuredHeight` on the runtime.
- **Setter/getter surface:** `setNativeTextString`, `setNativeTextStyle`, `patchNativeTextStyle` (shallow merge), `setNativeTextAutoSize`, `setNativeTextHeight`, `setNativeTextWidth`, `setNativeTextVerticalAlign`, `getNativeTextString`, `getNativeTextStyle`, `getNativeTextMeasuredWidth`, `getNativeTextMeasuredHeight`, `getNativeTextRuntime`. Scalar setters diff-skip. `setNativeTextStyle` and `patchNativeTextStyle` invalidate unconditionally.
- **Bounds:** `computeNativeTextLocalBoundsRectangle` -- reads runtime measurements under autoSize, falls back to fixed box.

### Layout cache (`textLabelLayout.ts`, 55 lines; test 133 lines)

- `ensureTextLayout` -- revision-gated, idempotent, delegates to `computeTextLayout` from textlayout. Shared by TextLabel and RichText via the per-kind `buildTextLayoutParams` hook on the runtime.
- `getTextLayout` -- ensures then returns the cached result (or null).
- `getTextLayoutMetrics` -- out-parameter convenience, zeroes metrics when no provider is registered.
- `setTextLabelGuard` -- the seam for the diagnostics layer.

### Diagnostics (`enableTextLabelGuards.ts`, `explainTextLabelContent.ts`)

- **Guard:** `enableTextLabelGuards` / `disableTextLabelGuards` -- warns via `logOnce` through `@flighthq/log` when `data.text` was mutated directly (without `setTextLabelString`), detected by comparing the live string against the rasterized string at `ensureTextLayout` time. Follows the diagnostics convention: separately importable, shakeable, emits through `@flighthq/log`.
- **Explain:** `explainTextLabelContent` -- returns `TextLabelContentExplanation` (agreement, liveString, rasterizedString, revision). Pure data, no side effects.

### Utility (`textFormatFont.ts`, 9 lines; test 28 lines)

- `computeTextFormatFontString` -- assembles a CSS font string from a `TextFormat`.

### Package shape

- 8 source files, 8 colocated test files. ~1,035 lines of source, ~2,142 lines of tests (roughly 2:1 test-to-source ratio).
- Two export lanes: `index.ts` (public, 78 named exports) and `contract.ts` (full surface, `export *` from all modules).
- `sideEffects: false`. No top-level side effects. No eager renderer registration.
- Dependencies: `entity`, `geometry`, `log`, `node`, `scene2d`, `signals`, `textlayout`, `types`.

## Gaps

### Diagnostics asymmetry: no RichText or NativeText guards/explain

The diagnostics pair (`enableTextLabelGuards` + `explainTextLabelContent`) exists only for TextLabel. RichText and NativeText have no equivalent. Charter North star #1 says "every RichTextData/TextLabelData/NativeTextData field has a first-class `set*` mutator" -- the same direct-mutation hazard that the TextLabel guard catches applies equally to `richText.data.text = '...'` or `nativeText.data.text = '...'`. The codebase diagnostics convention says "every silent sentinel gets a shakeable `explain*` query." The eight RichText metric convenience wrappers all return silent sentinels when no measure provider is registered, with no `explainRichTextMetrics` or `enableRichTextGuards` to distinguish "no shaper installed" from "the field is empty."

### Object-reference setters invalidate unconditionally

Six setters bump the content revision on every call regardless of whether the value changed: `setRichTextContent` (`richText.ts:441`), `setRichTextDefaultTextFormat` (`richText.ts:449`), `setRichTextFormatRange` (`richText.ts:454`), `setTextLabelFormat` (`textLabel.ts:122`), `setNativeTextStyle` (`nativeText.ts:117`), and `patchNativeTextStyle` (`nativeText.ts:85`). The status.md notes this and says "no decision is recorded on whether these should compare the reference, compare structurally, or keep bumping." This is a known gap against North star #1's "diff-skip" principle for all setters.

### `setRichTextFormatRange` appends without merge or replacement

`setRichTextFormatRange` (`richText.ts:460`) pushes a new entry onto `textFormatRanges` unconditionally. Repeatedly formatting the same span grows the array without bound. There is no merge, split, or replacement of overlapping ranges. `getRichTextFormatRangeAt` resolves the effective format by iterating all ranges in order, so the behavior is correct but the list grows. A range _editor_ -- the counterpart to the reader family (`getRichTextFormatRangesIn`, `getRichTextFormatRangeByIndex`) -- does not exist. This is documented in `status.md`.

### No inline objects

No `RichTextInlineObject` type or inline-image/object-run support exists. The status notes this requires a two-cell design decision (types + textlayout).

### Functional test coverage stops at static paths

The status reports that `functional/scenes/` covers `text-basic`, `text-wrap`, `text-multiformat`, `text-vertical-align`, alignment, style scenes, and `textlabel-basic`, but nothing exercises autoSize anchors, scrolling, or link dispatch -- the stateful paths where invalidation and layout staleness actually surface.

### `package.json` dependencies not alphabetized

`@flighthq/scene2d` appears before `@flighthq/entity` in the dependencies list. The SDK convention is alphabetical ordering.

### Module-level mutable state: `_textLabelGuard`

`textLabelLayout.ts:55` declares `let _textLabelGuard` at module scope -- a module-scoped mutable singleton that `setTextLabelGuard`/`enableTextLabelGuards` write to. The codebase design constraints say "no module-scoped mutable state that functions reach for." This is a minor tension: the diagnostics convention itself requires a shakeable guard module, and the guard inherently needs a registration seam. The `setTextLayoutMeasureProvider` in `textlayout` uses the same pattern, so this may be a tolerated exception for the diagnostics/provider registration pattern, but it is worth noting.

### TextLabel lacks programmatic mutation beyond append

TextLabel has `appendTextLabelString` but no `insertTextLabelString` or `replaceTextLabelString`. RichText has the full trio. For a simple single-format label this may be intentional (just use `setTextLabelString` to replace the whole string), but the asymmetry is worth surfacing.

## Charter contradictions

None found. The code conforms well to the charter's stated principles:

- **North star #1 (field-level control with diff-skip):** Every scalar setter diff-skips. The object-reference setters that invalidate unconditionally are noted but the charter itself acknowledges the invalidation doctrine question is open for object references.
- **North star #2 (programmatic mutation on the static entity):** `appendRichTextString`, `insertRichTextString`, `replaceRichTextString`, `setRichTextFormatRange` are all present and tested. Interactive editing is correctly delegated to the `input` slot.
- **North star #3 (lazy layout cache, revision-gated):** `ensureTextLayout`/`getTextLayout` follow the `ensure*` pattern, are revision-stamped and idempotent. Metric wrappers call `ensureTextLayout` and return sentinels.
- **North star #4 (thin, stable surface):** The package is 1,035 lines of source across 8 files. Hard text problems (shaping, layout, editing) are delegated to sibling packages.
- **Boundaries:** In-scope items are present; non-goals are correctly delegated.
- **Decision [2026-07-02] entities-not-engine:** Confirmed -- layout, shaping, editing all live elsewhere.
- **Decision [2026-07-02] programmatic-vs-interactive split:** The `input` slot on `RichTextRuntime` is nullable, `getRichTextPasswordCharacter` reads from it, and the text package works without `textinput`. Confirmed.
- **Decision [2026-07-02] `*Value` suffix dropped:** All metric wrappers use clean names (`getRichTextLineCount`, `getRichTextTextWidth`, etc.). Confirmed.

## Contract and docs fit

### Package against the contract

- **Types in `@flighthq/types`:** PASS. All types are imported from `@flighthq/types/contract`. No exported types defined inline in this package.
- **Full unabbreviated names:** PASS. Every exported function uses the full entity-type name (`RichText`, `TextLabel`, `NativeText`, `TextField`).
- **Out-parameters:** PASS. `computeRichTextLocalBoundsRectangle`, `computeTextLabelLocalBoundsRectangle`, `computeNativeTextLocalBoundsRectangle`, `getRichTextFormatRangeAt`, `getRichTextFormatRangeByIndex`, `getRichTextFormatRangesIn`, `getTextLayoutMetrics` all use `out` parameters correctly.
- **Sentinels not throws:** PASS. All metric wrappers return sentinels (`0`, `1`, `-1`, `null`) for the no-measure-provider case. `getRichTextFormatRangeByIndex` returns `false` for out-of-bounds. No throws for expected failure.
- **Two export lanes:** PASS. `index.ts` (curated public API) and `contract.ts` (`export *` full surface).
- **`sideEffects: false`:** PASS. Declared in `package.json`, and no top-level side effects exist.
- **`Readonly<T>` usage:** PASS. Parameters are consistently `Readonly<RichText>`, `Readonly<TextLabel>`, etc. for read-only operations. Mutable `source` parameters are typed without `Readonly` when mutation is intended.
- **Intra-SDK imports use `/contract`:** PASS. All imports from sibling packages use `@flighthq/x/contract`.
- **`import type` on its own line:** PASS. Verified across all source files.

### Contract or docs that need revision

- **Package Map dependency listing:** The `@flighthq/text` entry in the Package Map (AGENTS.md) lists it under "Scene graph" which is correct, but the Package Map does not mention `text-markup` in the same breath despite the charter's Open direction #2 discussing it as a neighbor. No action needed -- the Map reflects what exists, not what is planned.

## Candidate open directions

These are questions the charter does not answer that this review had to assume:

1. **Should the diagnostics pair extend to RichText and NativeText?** The guard/explain pattern exists only for TextLabel. The charter says "every field has a first-class setter" but is silent on whether every entity family needs the diagnostics pair. The diagnostics convention says every silent sentinel gets an `explain*` query, which would argue for `explainRichTextMetrics` at minimum.

2. **Should object-reference setters diff-skip by reference identity?** The invalidation doctrine says "identities are compared (reference-shaped fields are re-read)." The charter's North star #1 says "diff-skip." These two statements are in tension for object-reference fields. A decision would settle the six unconditional-invalidation setters.

3. **Should `setRichTextFormatRange` merge or replace overlapping ranges?** The current append-only behavior is simple but unbounded. The charter does not speak to range-editing semantics. A format-range editor (merge, split, replace) would be the natural complement to the reader family.
