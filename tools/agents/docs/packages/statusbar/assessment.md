---
package: '@flighthq/statusbar'
updated: 2026-06-25
basedOn: ./review.md
---

# statusbar — Assessment

Reasoned over `review.md` (merge-gate review of the `integration-b2824e3d8` delta vs the approved `origin/main` `eb73c3d74` baseline). The delta is **REJECT as-is** for a hard compile failure: the implementation imports `@flighthq/types` symbols (`StatusBar`, `StatusBarInfo`, `StatusBarAnimation`, `StatusBarStyleEntry`, `StatusBarStyleEntryHandle`) and backend methods (`getInfo`, `subscribe`, `animated`/`animation` params) that were never committed to the types package in this bundle.

## Recommended (sweep-safe, within-package)

These are the within-`statusbar` actions a worker can take to make the delta merge-able without a design decision. The blocking item is the first.

1. **Land the `@flighthq/types` `StatusBar.ts` half before this package can be considered.** The implementation already names the exact shape it needs; the types file must declare `StatusBar` (`{ onChange: Signal<…> }`), `StatusBarInfo` (`{ color, height, overlaysContent, style, visible }`), `StatusBarAnimation` (`'fade' | 'none' | 'slide'`), `StatusBarStyleEntry` (all-optional per-field), `StatusBarStyleEntryHandle` (`number`), and extend `StatusBarBackend` with `getInfo(out)`, `subscribe(listener): () => void`, `setVisible(visible, animation?)`, and `setBackgroundColor(color, animated?)`. _Caveat: this edits `@flighthq/types`, a sibling package — it is sweep-safe only because the implementation is dead without it and the shape is already fully specified by the charter + status.md; a worker should treat it as the unavoidable other half of the same change, not a fresh design._
2. **Re-run `tsc -b` and the package tests after the types land**, and correct any residual signature mismatch the type-check surfaces. The test file is written against the same missing symbols, so it compiles and passes only once item 1 is in.
3. **Replace the brittle test reset** (`for (let i = 0; i < 100; i++) popStatusBarStyleEntry(i)`) with a deterministic style-stack reset once one exists (see Backlog).

## Backlog (parked)

- **`clearStatusBarStyleStack()` test/util helper** — _why parked:_ a small new export with its own naming/contract question (is it public API or test-only?); not required to unblock the merge, and adding public surface is a design choice, not a sweep.
- **Reconsider `enableStatusBarSignals()` as a pure no-op marker** — _why parked:_ this is a convention question (does `enable*` earn its keep when there is no opt-in cost to gate?) that touches the platform-suite event-cell pattern broadly, not just `statusbar`. Routed to Open directions.

## Approved

_None. Approval is the user's verbal gate; this section is filled only when the user blesses an item. A merge-gate review never self-approves._

## Notes for the charter's Open directions

- **Cross-package coupling of this feature.** This change is fundamentally a two-package change (`statusbar` + `types`) that arrived as one. The recurring question for the charter: how should the platform suite stage feature lifts so the `@flighthq/types` header always lands **with or before** the implementation, never after (the types-first rule was inverted here). This is a process/charter fork, not a code edit.
- **`enable*`-without-cost.** Whether `enableStatusBarSignals` (and any peer event cell whose signals are always present) should keep an `enable*` marker that gates no real cost — or drop it — is an SDK-wide convention call for the platform-suite event cells. Ask the user before standardizing.
