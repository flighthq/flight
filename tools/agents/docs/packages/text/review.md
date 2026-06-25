---
package: '@flighthq/text'
status: partial
score: 58
updated: 2026-06-25
ingested:
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta
  - head/packages/text/src
  - head/packages/types/src/RichText.ts, TextInputState.ts, TextFormatRange.ts, index.ts
  - changes.patch (packages/text/ hunks)
---

# Review: @flighthq/text — MERGE GATE (integration-b2824e3d8 vs approved origin/main eb73c3d74)

This is a merge-gate review of the **incoming delta only**: head vs base under `incoming/integration-b2824e3d8/`. The approved baseline (`base/`, `origin/main` `eb73c3d74`) is the blessed floor and is not under review. Every finding cites a `b2824e3d8:<path>` hunk.

## Verdict

**partial — 58/100. REJECT for merge as integrated.** The _design_ of the delta is strong and worth keeping: it completes the RichText field surface, adds string-edit operations with format-range re-indexing, an opt-in TextField signals group, entity-level metric conveniences, and retires the legacy `internal.ts` cast. The feature is the right shape. But the delta **does not compile in this branch**: the `text` half landed without its `@flighthq/types` companion changes. `richText.ts` imports four types that no longer exist in the head `types` barrel, assigns to two `readonly` fields after deleting the cast that made that legal, and reads/writes a runtime slot that was never declared. A test literal constructs `TextInputState` fields the head type does not have. And the new `@flighthq/signals` import is not declared in `package.json`. The score reflects merge-readiness against the approved floor, not the quality of the idea — once the header split is healed, this is a clean, high-value merge.

Note on the bundle's own pre-written `review.md`/`assessment.md`/`status.md` (authored against `builder-67dc46d64`, score "solid 82"): those were written against a tree where the `types` changes DID land and where the six signals/edit exports were untested. Against the _actual integration head_, the types changes are absent (so it does not compile) and the six exports are now fully tested (so that defect is resolved). This review supersedes them for the merge decision.

## Blockers (compile / CI failures introduced by the delta)

1. **Four imported types are undefined.** `b2824e3d8:packages/text/src/richText.ts:8-43` imports `TextFieldSignals`, `TextFieldChangeEvent`, `TextFieldLinkEvent`, `TextFieldScrollEvent` from `@flighthq/types`. None exist in head `packages/types/src/` (`index.ts` exports no `TextField*`; `grep -rln TextFieldSignals head/packages/types/` is empty). The `changes.patch` `packages/types/` hunks add `FontMetrics`/`GlyphExtents`/`TextShaper`/etc. but no signals types. → TS2305.

2. **`readonly` write after the cast was deleted.** The delta removed `packages/text/src/internal.ts` (the `RichTextDataInternal` cast). Head `packages/types/src/RichText.ts:22-23` still declares `readonly scrollH: number;` / `readonly scrollV: number;`. `b2824e3d8:packages/text/src/richText.ts` now writes them directly: `:480` `source.data.scrollH = clamped;`, `:491` `source.data.scrollV = clamped;`, and `createRichTextData` `:129-130`. → TS2540 ("cannot assign to … read-only property"). The base compiled because it routed these writes through the now-deleted cast (`base:packages/text/src/richText.ts:101-102,154,163`). The delta broke that without the compensating `types` change.

3. **Undeclared runtime slot.** Head `RichTextRuntime` (`head/packages/types/src/RichText.ts:44-53`) has `input`, `richTextContent`, `selectionBeginIndex`, `selectionEndIndex` — no `textFieldSignals`. But `b2824e3d8:packages/text/src/richText.ts:153` assigns `out.textFieldSignals = null;` and `:175`, `:190`, `:314`, `:567`, `:576` read it. → TS2339 / TS2353.

4. **Test constructs missing `TextInputState` fields.** Head `head/packages/types/src/TextInputState.ts` declares only `alwaysShowSelection` and `caretIndex`, but `b2824e3d8:packages/text/src/richText.test.ts:530-541` builds an `input` literal also setting `caretColor`, `caretWidth`, `desiredCaretX`, `history`, `historyIndex`, `historyLimit`. `tsc -b` typechecks `src/*.test.ts`, so this is a build failure. → TS2353.

5. **Missing `@flighthq/signals` dependency.** `b2824e3d8:packages/text/src/richText.ts:7` `import { createSignal } from '@flighthq/signals'` (and `richText.test.ts:4` `connectSignal`), but `b2824e3d8:packages/text/package.json` `dependencies` lists only `displayobject, entity, geometry, node, textlayout, types`. → `npm run packages:check` (workspace dependency conventions) fails; the build survives only by hoisting.

Root cause is singular: the feature's `@flighthq/types` half (the four event types + the `textFieldSignals` slot + dropping `readonly` on the scroll fields + the editing-slot fields) was not included in the integration. Blockers 1–4 all heal with that one header change; blocker 5 is an independent manifest fix.

## What the delta gets right (judged against the contract, not scored against the absent header)

- **RichText field-mutator surface** (`b2824e3d8:packages/text/src/richText.ts:397-532`): ~20 `setRichText*` setters, each with a diff-skip guard and the correct content-vs-bounds invalidation split — `invalidateRichTextContent` (`:540-543`) re-invalidates bounds only when `autoSize !== 'none'`; fixed-box-only setters call `invalidateNodeLocalContent` and deliberately skip bounds. This closes the depth review's top gap.
- **String editing with format-range re-indexing**: `appendRichTextString` (`:48`), `insertRichTextString` (`:321-340`, shift / extend-straddle), `replaceRichTextString` (`:361-395`, the full shift / shrink-both-boundaries / remove-inside / trim-left / trim-right case split on a reverse splice). This is the most subtle new code and the new tests cover every branch (`richText.test.ts` `insertRichTextString` / `replaceRichTextString` blocks). Alias-safe: inputs are read into `previousText` before the mutation.
- **Signals seam shape** is correct per the SDK convention: `enableTextFieldSignals` (`:188-191`) is idempotent (`??=`), the slot is nullable and zero-cost when unused, emission is guarded on a non-null slot (`emitTextFieldChange` `:566-571`, `emitTextFieldScroll` `:575-585`), and `dispatchRichTextLinkAtPoint` (`:169-182`) is the convenience-that-also-emits, distinct from `textlayout`'s pure `getRichTextLinkAtPoint`.
- **`*Value` metric conveniences** (`:193-311`) wrap `textlayout` after `ensureTextLayout` and return sentinels (`0`/`1`/`-1`/`null`) when no measure provider is registered — correct sentinel discipline, no throws for expected failure.
- **NativeText additions** (`b2824e3d8:packages/text/src/nativeText.ts:65-91`): `getNativeText MeasuredWidth/Height/String/Style`, `patchNativeTextStyle` (shallow merge + invalidate). Read off the runtime; no DOM measurement leaks into the entity. Fine.
- **`internal.ts` retirement** is the map-sanctioned direction ("do not extend `internal.ts`; prefer the proper shape") — it is only _incomplete_ because the paired `types` change did not land.
- **Naming / ordering / tests**: full unabbreviated type words and correct verbs throughout; exports alphabetized; `describe` blocks mirror exports 1:1 across all three test files (verified — every export has a colocated block, including the six the bundle's review flagged as untested). No dead exports, no eager registration, `sideEffects: false`, single `.` export.

## Contract & docs fit

- **Composition / bedrock**: PASS. The delta adds free functions over the existing entity/runtime split; no feature bundled as config-gated branches, no subject fusion, no over-split. The signals group is a runtime-slot subsystem, correctly homed.
- **Naming clarity**: PASS.
- **Tree-shaking / bundle invariant**: PASS for the `text` package itself (no new hot-loop branch, no shared switch). The undeclared `signals` dependency (blocker 5) is a manifest-hygiene miss, not a bundle-invariant violation.
- **Registry vs closed union**: N/A — no dispatch family here.
- **Subject triad + plurality guard**: N/A for the delta; the `text-formats` question is an Open direction, not introduced here.
- **Contract hygiene**: FAIL as integrated — types are _not_ types-first (blockers 1–4 land the type _usage_ in `text` without the type _definitions_ in `@flighthq/types`), which is the precise inversion of the header-layer rule. One minor secondary drift: `getRichTextFormatRangeByIndex`'s `out` is an inline structural literal (`richText.ts:227-228`) where the existing named `TextFormatRange` (`head/packages/types/src/TextFormatRange.ts`, exactly `{ end, format, start }`) is the correct annotation. Sentinels, out-params, alias-safety, `Readonly<>` usage are otherwise correct.
- **Rust mirror**: the new `types` seam must be mirrored in `flighthq-types` before/with merge (see the dispatch brief).

## Thin spots (completeness, not merge blockers)

- **`condenseWhite` / `styleSheet` settable but not honored**: `setRichTextHtml` / `setRichTextCondenseWhite` / `setRichTextStyleSheet` set fields + invalidate, but the content-build (`computeRichTextContent` in `textlayout`) does not yet consume them. By design a `textlayout` responsibility; flag so it does not read as silently working.
- **No `getRichTextFormatRangesIn(beginIndex, endIndex)`** — the symmetric range _read_ partner to the existing `removeRichTextFormatRangesIn`; `getRichTextFormatRangeAt` is single-index only.
- **No functional/parity coverage** for multi-format RichText, autoSize anchors, word-wrap reflow, scroll, links, NativeText measurement — render-path scenes jsdom cannot reach. Cross-tree, parked.

## Candidate open directions (for the charter to settle)

The charter is a stub (North star / Boundaries / Decisions / Open directions all `TODO`), so most of "what good means here" is undecided. The shape questions this delta raises:

1. The `*Value` accessor family — keep, rename, or drop (the suffix only dodges a `textlayout` name collision).
2. Bless `TextFieldSignals` (change/link/scroll) as the canonical field-event set; rule on `selection`/`caret` belonging in `text` vs `textinput`.
3. Append/insert/replace on a non-editable field — confirm the static-field-owns-programmatic-mutation vs. `textinput`-owns-interactive-editing boundary.
4. Where HTML/`styleSheet` semantics live — a `text-formats` neighbor (plurality-gated) vs. folding into `textlayout`'s content-build.
5. Rust mirror posture — `flighthq-text` waits until #1–#2 settle.
