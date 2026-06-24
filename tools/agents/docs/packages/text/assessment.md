---
package: '@flighthq/text'
updated: 2026-06-24
basedOn: ./review.md
---

# text — Assessment

Sorted from `review.md` (score `solid — 82`). The prior maturation roadmap (`reviews/maturation/depth/text.md`) is absorbed here and noted for removal — its Bronze tier is already _delivered_ (the full `RichText` mutator/accessor surface, `internal.ts` retirement, append/insert/replace, the signals group, the metric `*Value` conveniences all shipped in the `builder-67dc46d64` bundle), so the remaining roadmap value is its Silver/Gold cross-package items, which fall to Backlog and Open directions below.

The review's defining finding is that the **entity surface is essentially complete** but ships with **two CI-breaking defects** (`npm run check` would fail as delivered). Those two — plus a small mis-homed type and one missing symmetric reader — are the genuinely sweep-safe set. Everything else (the `*Value` family's existence, the HTML/`styleSheet` semantics home, the signals-group blessing, the Gold OpenFL fields, functional/parity coverage, the Rust mirror) is a charter decision or crosses a package boundary, so `Recommended` stays deliberately small and the bulk routes to Open directions.

## Recommended

Strictly sweep-safe: within `@flighthq/text`, no cross-package coupling, no breaking change, no open design decision.

- **Add the missing `@flighthq/signals` dependency to `package.json`.** `richText.ts:7` imports `createSignal` from `@flighthq/signals`, but `packages/text/package.json` `dependencies` omits it (only `displayobject`, `entity`, `geometry`, `node`, `textlayout`, `types`). The build survives today only via hoisting; `npm run packages:check` (workspace dependency conventions) fails on it. Add the workspace dependency to match the import. A manifest fix only — no source change. — review.md (Gaps: defects; Contract & docs fit: contract violations).

- **Add colocated tests for the six untested exports** so `exports:check` passes: `createTextFieldSignals`, `dispatchRichTextLinkAtPoint`, `enableTextFieldSignals`, `getTextFieldSignals`, `insertRichTextString`, `replaceRichTextString`. Each needs a `describe` in `richText.test.ts` (the file currently has neither a block nor a reference for any of them). Critically, the tests should exercise the **least-tested, most-subtle** new code the review flags: the `textFormatRanges` re-indexing (shift/extend/trim/remove on splice) inside `insertRichTextString`/`replaceRichTextString`, and the change/scroll/link _emission_ paths inside the setters (enable the group, mutate, assert the emit). Within-package; mandated by the gate. — review.md (Gaps: defects; Contract & docs fit: contract violations).

- **Home `getRichTextFormatRangeByIndex`'s `out` type in `@flighthq/types`.** The `out` parameter is an inline structural literal (`{ start: number; end: number; format: TextFormat }`) where the named `TextFormatRange` from `@flighthq/types` already exists and is the correct annotation. The codebase-map rule is that cross-package shapes live in `types`; this is a one-line annotation swap with no behavior change. — review.md (Gaps: thin spots; Contract & docs fit: structural-forks fit).

- **Add `getRichTextFormatRangesIn(beginIndex, endIndex)`** — the symmetric range _read_ partner to the existing `removeRichTextFormatRangesIn`, returning the format ranges overlapping a span. `getRichTextFormatRangeAt` covers single-index only, leaving the OpenFL `getTextFormat(beginIndex, endIndex)` read half open. Within-package (the range list and `mergeTextFormat` are already available), follows the established accessor pattern, needs a colocated test. — review.md (Gaps: thin spots).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **`condenseWhite` / `styleSheet` actually honored, not just stored.** `setRichTextHtml`, `setRichTextCondenseWhite`, `setRichTextStyleSheet` set fields + invalidate, but the content-build (`computeRichTextContent`) in `@flighthq/textlayout` does not yet consume them — the entity surface _promises_ behavior the engine does not deliver. **Parked:** cross-package (the work is in `textlayout` and/or a `-formats` parse seam) and the _where_ is an Open direction. Routed below.

- **Functional / parity test coverage** — multi-format RichText, autoSize anchors, word-wrap reflow, scroll, links, NativeText measurement. **Parked:** these are render-path scenes the jsdom unit tests cannot reach; they live in `tests/functional/` (cross-tree) and exercise the renderer packages, not just `text`. The entity surface is now complete enough to unblock them, but the work is outside a within-package sweep. — review.md (Gaps: thin spots; Candidate open directions).

- **The `*Value` accessor family — keep, rename, or drop.** The `*Value` suffix (`getRichTextLineCountValue`, `getRichTextTextWidthValue`, …) exists only to dodge a name collision with the `textlayout` functions they wrap. **Parked:** whether `text` re-exposes layout metrics as entity conveniences at all is an API-shape charter decision, not sweep-safe. Routed to Open directions.

- **Bless the signals-group home + payload set.** `TextFieldSignals` (change/link/scroll) is homed in `text` per convention and wired correctly (opt-in `enable*`, nullable slot, zero-cost-when-unused). **Parked:** confirming `TextFieldSignals` as the _canonical_ field-event set — and ruling on whether a `selection`/`caret` event belongs here or in `@flighthq/textinput` — is a charter decision and touches the `textinput` boundary. Routed to Open directions.

- **`@flighthq/text-formats` neighbor for HTML/`TextField`-HTML parse & serialize** (`parseRichTextHtml` → `{ text, textFormatRanges }`, `serializeRichTextHtml`), keeping the regex/parse weight out of the core `text` bundle behind a registered seam. **Parked:** a new triad `-formats` cell (cross-package) that needs a **plurality check** (≥2 formats) before creation per the structural-forks plurality guard, and a decision on whether HTML semantics live in the parser or in `textlayout`'s content-build. Routed to Open directions.

- **Append/insert/replace on a non-editable field — confirm in scope.** `appendRichTextString` / `insertRichTextString` / `replaceRichTextString` now exist on the static entity (interactive editing proper lives in `@flighthq/textinput`). **Parked:** the static-field-owns-programmatic-mutation vs. `textinput`-owns-interactive-editing boundary is an Open direction; the code assumes it, the charter should confirm it. Routed to Open directions.

- **Gold OpenFL `TextField` semantic fields** — `restrict`, `displayAsPassword` promotion on a static field, `embedFonts`/`antiAliasType`/`sharpness`/`thickness`/`gridFitType`, `useRichTextClipboard`/`alwaysShowSelection`, `replaceSelectedText`, and inline `<img>`/tab/bullet layout. **Parked:** these couple to `@flighthq/textinput` (restrict/maxChars/replaceSelectedText), the renderer packages and `@flighthq/textshaper` (embed-font / anti-alias descriptors), and `@flighthq/textlayout` (inline-object layout model) — all cross-package design decisions. — review.md (By-design delegation; maturation Gold tier).

- **Rust mirror `flighthq-text`.** **Parked:** the worker and review both say it should wait until the `*Value` family, the HTML/`styleSheet` home, and the signals-group blessing settle, since the crate conforms to the final TS surface; porting earlier means re-porting. Depends on `flighthq-textlayout`
  - the `textshaper` (rustybuzz) stack for non-Canvas rendering. — review.md (Candidate open directions #5).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is a stub — North star, Boundaries, Decisions, and Open directions are all `TODO` — so most of "what good means here" is undecided. The review already enumerates these as candidate Open directions; the assessment confirms they are the forks keeping the bulk of the backlog parked:

1. **North star.** Confirm the durable bar: this package owns the _display-object entity layer + its field get/set surface_, delegating the text engine (glyph layout, line metrics, hit-test geometry to `textlayout`; caret/selection/editing to `textinput`; shaping/measure to `textshaper`; rasterization to the renderers). Bless the delegation boundary so future work is judged against it.

2. **The `*Value` accessor family — keep, rename, or drop?** Decide whether `text` re-exposes `textlayout` metrics as entity conveniences at all (and if so, settle the suffix), or whether users call `textlayout` directly after `ensureTextLayout`.

3. **Where do HTML / `styleSheet` semantics live?** A `@flighthq/text-formats` neighbor (HTML/CSS parse seam, registry-dispatched like the shaper) vs. folding into `textlayout`'s content-build — a structural-forks B / triad question needing a plurality check before any `-formats` cell is created. This also resolves the "settable but not honored" `condenseWhite`/`styleSheet` gap.

4. **Bless `TextFieldSignals` (change/link/scroll) as the canonical field-event set**, and rule on whether a `selection`/`caret` event belongs in `text` or in `textinput`.

5. **Append/insert/replace on a non-editable field — in scope?** Confirm the static field owns _programmatic_ text mutation while `textinput` owns _interactive_ editing, so the boundary is explicit rather than assumed.

6. **Rust mirror posture.** `flighthq-text` waits until #2–#4 settle (they shape the final TS surface the port conforms to).

Housekeeping for the ingest: the `status.md` entry under-claims the delivery (it marked signals, insert/replace, and the `textlayout` hit-test fix as _deferred_ when all three shipped) and should be marked **superseded** by `review.md`.
