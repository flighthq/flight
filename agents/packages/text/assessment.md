---
package: '@flighthq/text'
updated: 2026-07-02
basedOn: ./review.md
---

# text — Assessment

Sorted from `review.md` (partial, 58/100 — against the integration head where types changes were absent), the depth review (solid, 72/100), and the direction session (2026-07-02). Four Decisions blessed. The builder landed the bulk of the depth review's recommendations: full setter surface, read accessors, string editing with format-range re-indexing, signals group, metric convenience wrappers, internal.ts retirement. The package is substantially complete as a text display-object entity layer.

## Recommended

Strictly sweep-safe: within `@flighthq/text` or flagged cross-package cleanup.

- **Flag textlayout's `_text` parameter for removal.** `computeRichTextCharIndexAtPoint` in `packages/textlayout/src/richTextQuery.ts` takes a `_text: string` parameter documented as "kept for backward compatibility; will be removed in a future breaking release." Pre-release code has no backward-compatibility obligations (charter Decision #4). Remove the parameter and update all callsites. _(Cross-package: touches textlayout and text.)_

## Backlog

Parked — each with the reason it is not sweep-safe.

- **condenseWhite/styleSheet wiring.** _Parked — cross-package._ `setRichTextCondenseWhite` and `setRichTextStyleSheet` store + invalidate, but textlayout's `computeRichTextContent` doesn't consume them. Depends on the text-formats question (charter Open direction #2).
- **text-formats neighbor package.** _Parked — needs design + plurality check._ HTML/CSS parse seam, registry-dispatched. Charter Open direction #2.
- **Signal ownership settlement.** _Parked — depends on textinput direction session._ Whether change/scroll/link signals fire on programmatic mutation only, and where selection/caret signals live. Charter Open direction #3.
- **Functional/parity test coverage.** _Parked — cross-tree._ Multi-format RichText, autoSize anchors, word-wrap reflow, scroll, links, NativeText measurement — render-path scenes jsdom cannot reach. Needs `tests/functional/` scenes exercising the renderer packages.
- **Rust `flighthq-text` port.** _Parked — depends on Open directions #1–#4 settling._ The final TS surface must stabilize first.

## Approved

- [2026-07-02 · picked] Flag textlayout `_text` parameter for removal — charter Decision #4, pre-release no-backward-compat rule
