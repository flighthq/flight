---
package: '@flighthq/text'
updated: 2026-07-31
basedOn: ./review.md
---

# text — Assessment

Sorted from `review.md` (partial, 58/100 — against the integration head where types changes were absent), the depth review (solid, 72/100), and the direction session (2026-07-02). Four Decisions blessed. The builder landed the bulk of the depth review's recommendations: full setter surface, read accessors, string editing with format-range re-indexing, signals group, metric convenience wrappers, internal.ts retirement. The package is substantially complete as a text display-object entity layer.

## Closed 2026-07-30

*Flag textlayout's `_text` parameter for removal* — **done, by a peer.** `computeRichTextCharIndexAtPoint`
is now `(layout, x, y)`; builder3's textlayout sweep removed the parameter. Verified against live
source, not assumed.

## Recommended

Re-verified against live source on 2026-07-31 (7 source files, 5 test files, 195 tests, 75 exports). The
single item is unchanged and still open: all five setters assign and invalidate unconditionally
(`setRichTextDefaultTextFormat` is three lines — assign, `invalidateRichTextContent`, return), and no ruling
on object-setter comparison has been recorded in [invalidation](../../conventions/invalidation.md).

1. **`setRichTextContent`, `setRichTextDefaultTextFormat`, `setRichTextFormatRange`,
   `setTextLabelFormat` and `setNativeTextStyle` invalidate unconditionally.** The string setters are
   now guarded (`setRichTextString` fixed 2026-07-30; `setTextLabelString` already was), but these five
   take objects, where a cheap `===` is meaningless and a deep compare may cost more than the
   invalidation it saves. Whether they should compare at all — and if so by what — is a real call, not
   a sweep: a format object is usually freshly built by the caller, so `===` would never hit, while a
   structural compare is O(fields) against an O(layout) saving. **Wants a ruling**, and it is the same
   question for all five.

## Backlog

Parked — each with the reason it is not sweep-safe.

- **condenseWhite/styleSheet wiring.** _Parked — cross-package._ `setRichTextCondenseWhite` and `setRichTextStyleSheet` store + invalidate, but textlayout's `computeRichTextContent` doesn't consume them. Depends on the text-formats question (charter Open direction #2).
- **text-formats neighbor package.** _Parked — needs design + plurality check._ HTML/CSS parse seam, registry-dispatched. Charter Open direction #2.
- **Signal ownership settlement.** _Parked — depends on textinput direction session._ Whether change/scroll/link signals fire on programmatic mutation only, and where selection/caret signals live. Charter Open direction #3.
- **Functional/parity test coverage.** _Parked — cross-tree._ Multi-format RichText, autoSize anchors, word-wrap reflow, scroll, links, NativeText measurement — render-path scenes jsdom cannot reach. Needs `tests/functional/` scenes exercising the renderer packages.
- **Rust `flighthq-text` port.** _Parked — depends on Open directions #1–#4 settling._ The final TS surface must stabilize first.

## Approved

- [2026-07-02 · picked] Flag textlayout `_text` parameter for removal — charter Decision #4, pre-release no-backward-compat rule
