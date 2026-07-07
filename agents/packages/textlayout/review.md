---
package: '@flighthq/textlayout'
status: partial
score: 45
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - changes.patch
  - head/packages/textlayout/src
  - head/packages/types/src
  - charter.md
---

# textlayout — Merge Review (integration-b2824e3d8 → origin/main)

Evidence: the **delta** between `incoming/integration-b2824e3d8/head/packages/textlayout/` and the approved baseline `incoming/integration-b2824e3d8/base/packages/textlayout/` (= `origin/main` `eb73c3d74`), plus the `packages/textlayout/` hunks of `incoming/integration-b2824e3d8/changes.patch`. Findings cite `b2824e3d8:<path>`. This is a **merge gate**, not a survey of the package — the baseline is the blessed floor and is not under review. The charter is a pure stub (every body section is `_TODO_`), so the bar falls back to the codebase-map AAA standard and the contract.

## Verdict

`partial — 45/100` as a **merge candidate**, gated **REJECT** until one blocker is resolved. The _feature work_ in the delta is genuinely strong: it closes the Bronze "typed-but-dropped" gaps the depth review named — `justify` inter-word distribution, `start`/`end` direction-relative alignment, `<li>` bullets with hanging indent, `maxLines` ellipsis truncation, the per-format `kerning` flag — and replaces UTF-16-naive `charAt` iteration with correct codepoint stepping so surrogate pairs are no longer split. The gutter constant is de-duplicated cleanly and `getTextLineBreakIndex` is upgraded to a binary search with a sound precondition. **But the integration as shipped does not compile**: every new feature reads type surface (`TextDirection`, `TextJustification`, `TextLayoutParams.maxLines/direction/justification/truncationCharacter`, `TextFormat.listMarker`) that is **absent from this integration's `@flighthq/types`**. The types half of the change was not merged alongside the source half. The score reflects "good code, wrong tree": a real improvement riding on a header layer that did not land.

## What the delta does (verified against source)

- **Codepoint iteration** (`b2824e3d8:packages/textlayout/src/textLayout.ts` `charAdvances`, `breakLongWord`). `charAt`/`substr` pair measurement is replaced by `text.codePointAt(i)` with a `charLen = cp > 0xffff ? 2 : 1` stride, so emoji/astral scripts are measured and wrapped as single units. The "always place at least one codepoint" floor (`if (charCount === 0)`) preserves forward progress. Correct and well-commented.
- **Kerning flag.** `const kerningEnabled = format.kerning !== false;` gates the pair-wise lookahead measurement; when off, each glyph is measured standalone. Reads `TextFormat.kerning` (present in head `TextFormat`).
- **Justify** (`justifyLines`). Per-line residual `available - lineW` distributed across `lineGroups.length - 1` group boundaries, skipping paragraph-final lines tracked in `_paragraphLastLines` — the CSS "last line is not justified" rule. The model is space-count-by-group-boundary, a coarse approximation (see Gaps).
- **start/end alignment** (`applyAlignment`). `'start'`/`'end'` resolve to `left`/`right` under `direction`, reversing under `'rtl'`.
- **Bullets** (`emitBullet`). Hanging-indent `•` group at paragraph start when `format.bullet === true`, with `listMarker === 'none'` suppressing the glyph while keeping indent. Reads `TextFormat.bullet` (present) and `TextFormat.listMarker` (**absent** — see Blocker).
- **Truncation** (`checkTruncation`, `getTextLayoutIsTruncated`). On reaching `maxLines`, trims the tail of the last group until the ellipsis fits and pushes a synthetic ellipsis group. Threaded through the main loop and `breakLongWord` via a `truncated` flag and `if (truncated) return/break` guards.
- **Gutter de-duplication** (`textBounds.ts`, `textLayout.ts`). `TEXT_LAYOUT_GUTTER` is the single source; `TEXT_BOUNDS_GUTTER` is re-exported as an alias. `richTextMetrics.ts` still consumes `TEXT_BOUNDS_GUTTER`, so no import is broken. Clean, zero-drift.
- **richTextQuery fix.** `getRichTextCharIndexAtPoint` no longer reads a bare `text` (a prior-bundle bug); line 68 now derives `lineStart` from `layout.groups[last].endIndex`. The `_text` param is renamed and documented unused.
- **Binary-search line-break index.** `getTextLineBreakIndex` is now `O(log n)`; `getTextLineBreaks` pushes in ascending order, so the sorted precondition holds.

## Blocker (merge-stop) — grounded

**The delta references type surface that does not exist in this integration's `@flighthq/types`, so the package does not typecheck.** `tsc -b` typechecks `src/*.test.ts` too, so both source and tests fail.

- `b2824e3d8:packages/textlayout/src/textLayout.ts:1` imports the missing types:
  ```ts
  import type {
    TextDirection,
    ...
    TextJustification,
    ...
  } from '@flighthq/types';
  ```
  An exhaustive search of `head/packages/types/src/` (and the whole head tree) finds **no** `TextDirection.ts`, `TextJustification.ts`, or `TextListMarker.ts`, and the types barrel (`head/packages/types/src/index.ts`) does not export them. → TS2305 "Module has no exported member".
- `b2824e3d8:packages/textlayout/src/textLayout.ts:36-39` destructures fields the head `TextLayoutParams` interface does not declare:
  ```ts
  direction = 'ltr',
  justification = 'interWord',
  maxLines = -1,
  truncationCharacter = '…',
  } = params;
  ```
  Head `TextLayout.ts` `TextLayoutParams` has only `{ autoSize, border, formatRanges, height, measure, multiline, text, width, wordWrap }`. → TS2339 on each read.
- `b2824e3d8:packages/textlayout/src/textLayout.ts:325` reads `currentFormat.listMarker === 'none'`, but head `TextFormat.ts` has no `listMarker` field. → TS2339.
- `b2824e3d8:packages/textlayout/src/textLayout.ts:723-728` `getTextLayoutIsTruncated` reads `params.maxLines` — same missing field.
- The tests assert the broken surface against an explicit annotation: `b2824e3d8:packages/textlayout/src/textLayout.test.ts:487` `const params: TextLayoutParams = { ..., maxLines: 2 }` → TS2353 "Object literal may only specify known properties … 'maxLines' does not exist in type 'TextLayoutParams'".

Root cause: the codebase-map's header-layer rule ("define its types in `@flighthq/types` first, then implement against them") was followed in the _builder_ bundle the prior review (`builder-67dc46d64`, score 68) was written against — that review explicitly claims "New cross-package types (`TextDirection`, `TextJustification`, `TextListMarker`, extended `TextLayoutParams`) are homed in `@flighthq/types`." In **this** integration, the textlayout source landed and the `@flighthq/types` half did not. This is precisely the split-integration defect a merge gate exists to catch; it is not a pre-release-latitude case (latitude waives back-compat, not compilation).

## Smaller delta findings

- **Dead `_text` parameter justified by a non-existent obligation.** `b2824e3d8:packages/textlayout/src/richTextQuery.ts:10` / `:35` add JSDoc: "Kept for backward compatibility; will be removed in a future breaking release." Flight has **no** back-compat duty pre-release ("rename it, restructure it, or remove it — do not accumulate workarounds"). The fix changed the implementation off `text`, so the parameter is now genuinely vestigial. The right delta is to drop the parameter from both `getRichTextCharBoundaries` and `getRichTextCharIndexAtPoint` and their callers/tests now, not to ship a dead arg with a deferral comment.

- **Composition smell: `buildGroups` absorbed three more config-gated features.** The delta threads `maxLines`/`truncationCharacter`/bullet through the single layout closure as branches and `if (truncated)` guards (`b2824e3d8:packages/textlayout/src/textLayout.ts:442,473,486,504,542`), plus new `checkTruncation` and `emitBullet` inner closures. Per the codebase map, "a monolithic function that bundles features as config-gated branches is the within-unit form of the [decomposition] smell." This is a within-package direction concern (the charter is a stub), not a merge-stop, but the layout core now carries truncation and list-marker policy that want to be their own passes (the alignment/justify split is the right model to follow).

- **Justify model is group-boundary-counted, not space-counted.** `b2824e3d8:packages/textlayout/src/textLayout.ts:650` `const spaceCount = Math.max(0, lineGroups.length - 1)` treats each `align: 'justify'` group boundary as one inter-word gap. A single multi-word run with no format changes is one group, so its internal spaces receive **no** expansion — justification only stretches at format boundaries, not at every space. Functionally honest for multi-run text, visibly wrong for plain justified prose. A direction item (the prior review flagged the same as "genuinely-incomplete justification model"), not a blocker.

## Contract & packaging (delta)

- `package.json` is **unchanged**: `sideEffects: false`, single `.` export, deps `@flighthq/textshaper` + `@flighthq/types`. No new top-level side effects; new module scratch `_paragraphLastLines` is a private `Set`, consistent with the existing `_lineBreaks`/`_charAdvances` scratch pattern. No tree-shaking regression in the manifest.
- New exports are alphabetized within their barrel entry (`b2824e3d8:packages/textlayout/src/index.ts:45`: `computeTextLayout, createTextLayoutResult, getTextLayoutIsTruncated, TEXT_LAYOUT_GUTTER`) and each has colocated coverage (`getTextLayoutIsTruncated` + `TEXT_LAYOUT_GUTTER` describe blocks in `textLayout.test.ts`; `TEXT_BOUNDS_GUTTER` in `textBounds.test.ts`) — `exports:check` would pass once it compiles.
- Tests are colocated, alphabetized, and mirror exports; they are substantive (codepoint, bullet, justify, truncation×wrap, start/end, kerning conformance cases). Honest coverage — **but they cannot run** until the type blocker is fixed (they reference the missing fields).
- Naming is clean: `getTextLayoutIsTruncated` (`is*` boolean, full type word), `TEXT_LAYOUT_GUTTER` / `TEXT_BOUNDS_GUTTER` are self-identifying. No abbreviations introduced.
- The Rust mirror `flighthq-textlayout` is named in the charter front matter; the delta does not touch it. The new type seam, once homed in `@flighthq/types`, must also be mirrored there — out of scope for this package's gate.

## Bottom line

The feature delta is the right feature set, built to the right naming and packaging rules, with real tests. It is **not mergeable as integrated** because its required `@flighthq/types` additions are missing from this branch, making the package fail to compile. Resolve the header-layer split (land the four `TextLayoutParams` fields, the two new type aliases, and `TextFormat.listMarker` in `@flighthq/types`), drop the vestigial `_text` parameter, and the delta is a strong merge. The composition and justify-model items are post-merge direction, not gates.
