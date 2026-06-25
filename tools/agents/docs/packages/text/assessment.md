---
package: '@flighthq/text'
updated: 2026-06-25
basedOn: ./review.md
---

# text — Assessment (merge gate, integration-b2824e3d8 vs origin/main eb73c3d74)

Sorted from `review.md` (`partial — 58`, **REJECT for merge as integrated**). The defining finding is that the `text` delta is a well-shaped, high-value feature that **does not compile in this branch** because its `@flighthq/types` companion half was not integrated. The header split is the whole story: four type imports resolve to nothing, two `readonly` fields are written after the cast that allowed it was deleted, a runtime slot is used but never declared, and a test literal sets fields the head type lacks — plus one undeclared `@flighthq/signals` dependency. Everything below "Recommended" is a charter decision or crosses a package boundary; the merge-gate must-fixes are dispatched to the integration worker in `outgoing/integration/text.md` rather than swept here, because four of the five touch `@flighthq/types`, which is outside this package and outside a within-package sweep.

## Recommended

Strictly sweep-safe: within `@flighthq/text`, no cross-package coupling, no breaking change, no open design decision. The merge blockers are deliberately NOT here — they require editing `@flighthq/types` (out of package) and are routed to the dispatch brief.

- **Add `@flighthq/signals` to `packages/text/package.json` dependencies.** `richText.ts:7` imports `createSignal` from `@flighthq/signals`, but the manifest omits it; `npm run packages:check` fails on the undeclared import (build survives only by hoisting). Manifest-only, within-package, no source change. — review.md (Blockers #5; Contract & docs fit).

- **Home `getRichTextFormatRangeByIndex`'s `out` type in `@flighthq/types`'s existing `TextFormatRange`.** `richText.ts:227-228` annotates `out` as an inline literal `{ start: number; end: number; format: TextFormat }`; the named `TextFormatRange` already exists (`head/packages/types/src/TextFormatRange.ts`, exactly `{ end, format, start }`) and is the correct annotation. One-line swap, no behavior change. (Touches only the `import type` and the parameter annotation in `text`; does not modify `types`.) — review.md (Contract & docs fit; Thin spots).

- **Add `getRichTextFormatRangesIn(beginIndex, endIndex)`** — the symmetric range _read_ partner to the existing `removeRichTextFormatRangesIn`, returning the format ranges overlapping a span (the OpenFL `getTextFormat(beginIndex, endIndex)` read half). `getRichTextFormatRangeAt` covers single-index only. Within-package, follows the established accessor pattern, needs a colocated test. — review.md (Thin spots).

## Backlog

Parked: needs a charter decision, crosses a package boundary, belongs to another doc's owner, or is larger than a sweep. Each carries why.

- **The merge blockers themselves (1–4) are a `@flighthq/types` change, not a `text` sweep.** Landing the four `TextField*` event types, the `RichTextRuntime.textFieldSignals` slot, the non-`readonly` scroll fields, and the `TextInputState` editing fields all edit `@flighthq/types`. **Parked here** because the hard rule forbids editing another package from a `text` assessment; these are dispatched as MUST-FIX directives in `outgoing/integration/text.md` for the integration worker. — review.md (Blockers #1–#4).

- **Rust mirror of the new `types` seam.** Once the four event types + the runtime slot + the scroll fields land in `@flighthq/types`, they must be mirrored in `flighthq-types` for `flighthq-text` conformance. **Parked:** cross-tree, depends on the header change settling. — review.md (Contract & docs fit: Rust mirror).

- **`condenseWhite` / `styleSheet` actually honored, not just stored.** `setRichTextHtml` / `setRichTextCondenseWhite` / `setRichTextStyleSheet` set fields + invalidate, but `computeRichText Content` in `@flighthq/textlayout` does not consume them. **Parked:** cross-package; the _where_ (a `text-formats` parse seam vs. `textlayout`'s content-build) is an Open direction. — review.md (Thin spots; Open directions #4).

- **Functional / parity coverage** — multi-format RichText, autoSize anchors, word-wrap reflow, scroll, links, NativeText measurement. **Parked:** render-path scenes the jsdom unit tests cannot reach; cross-tree (`tests/functional/`), exercise the renderer packages. — review.md (Thin spots).

- **The `*Value` accessor family — keep, rename, or drop.** The `Value` suffix only dodges a name collision with the `textlayout` functions it wraps. **Parked:** whether `text` re-exposes layout metrics as entity conveniences at all is an API-shape charter decision. Routed to Open directions.

- **Bless the signals-group home + payload set.** `TextFieldSignals` (change/link/scroll) is homed and wired correctly. **Parked:** confirming it as the _canonical_ field-event set — and ruling whether a `selection`/`caret` event belongs here or in `@flighthq/textinput` — is a charter decision touching the `textinput` boundary. Routed to Open directions.

- **Append/insert/replace on a non-editable field — confirm in scope.** These now exist on the static entity (interactive editing proper lives in `@flighthq/textinput`). **Parked:** the static-field-owns-programmatic-mutation vs. `textinput`-owns-interactive-editing boundary is an Open direction. Routed to Open directions.

- **Gold OpenFL `TextField` semantic fields** — `restrict`, `displayAsPassword` promotion on a static field, `embedFonts`/`antiAliasType`/`sharpness`/`gridFitType`, `replaceSelectedText`, inline `<img>`/tab/bullet layout. **Parked:** couple to `@flighthq/textinput`, the renderer packages, `@flighthq/textshaper`, and `@flighthq/textlayout` — cross-package design decisions. — review.md (by-design delegation).

## Approved

_None. Approval is the user's verbal gate; this section is frozen only on explicit approval._

## Notes for the charter's Open directions

Surfaced for an explicit direction conversation (do not edit the charter here). The charter is a stub — North star, Boundaries, Decisions, and Open directions are all `TODO` — so most of "what good means here" is undecided. The review enumerates these as the forks keeping the bulk of the backlog parked:

1. **North star.** Confirm the durable bar: this package owns the _display-object entity layer + its field get/set surface_, delegating the engine (glyph layout / line metrics / hit-test geometry to `textlayout`; caret/selection/editing to `textinput`; shaping/measure to `textshaper`; rasterization to the renderers). Bless the delegation boundary so future work is judged against it.

2. **The `*Value` accessor family — keep, rename, or drop?** Decide whether `text` re-exposes `textlayout` metrics as entity conveniences at all (and if so, settle the suffix), or whether users call `textlayout` directly after `ensureTextLayout`.

3. **Where do HTML / `styleSheet` semantics live?** A `@flighthq/text-formats` neighbor (HTML/CSS parse seam, registry-dispatched like the shaper) vs. folding into `textlayout`'s content-build — a structural-forks B / triad question needing a plurality check (≥2 formats) before any `-formats` cell. Also resolves the "settable but not honored" `condenseWhite`/`styleSheet` gap.

4. **Bless `TextFieldSignals` (change/link/scroll) as the canonical field-event set**, and rule whether a `selection`/`caret` event belongs in `text` or in `textinput`.

5. **Append/insert/replace on a non-editable field — in scope?** Confirm the static field owns _programmatic_ text mutation while `textinput` owns _interactive_ editing, so the boundary is explicit rather than assumed.

6. **Rust mirror posture.** `flighthq-text` (and the `flighthq-types` mirror of the new event seam) waits until #2–#4 settle — they shape the final TS surface the port conforms to.

Housekeeping for the ingest: the integration's pre-written `status.md`/`review.md`/`assessment.md` (authored against `builder-67dc46d64`, "solid 82") describe a tree where the `@flighthq/types` companion changes landed; against the actual integration head they did not, so the package does not compile. Those bundle docs are **superseded** by this merge-gate review for the merge decision.
