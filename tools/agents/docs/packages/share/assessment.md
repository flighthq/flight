---
package: '@flighthq/share'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/share — merge gate (integration-b2824e3d8)

The review's verdict is **REJECT**: the integration head ships the `@flighthq/share` implementation without the `@flighthq/types` definitions it depends on, so the package does not compile. Everything below is conditioned on that being resolved first — there is nothing to sweep into a package that will not `tsc -b`.

## Recommended (sweep-safe, within-package)

Safe to do inside `packages/share/` once the package compiles. None is a design decision.

- **Fix the helper casing.** Rename the private `shareFileTodomFile` → `shareFileToDomFile` (`b2824e3d8:packages/share/src/share.ts:185`, `:191`). Pure rename, internal call site only, no public surface or test churn.

## Backlog (parked — each with why)

- **The merge-blocking type gap is NOT a within-package sweep.** Restoring `ShareFile`/`ShareResult`/`ShareOptions`/the extended `ShareBackend`/`ShareContent.files`/`ShareSignals.ts` is a `@flighthq/types` change — a different package, across the cell boundary — and is the integration sandbox's reconciliation job (bring the matching types commit into the head, or back the share change out). Parked here because the assessment is within-package; the actionable directive lives in the dispatch brief.
- **`_signalSubscriptions` dead-code removal.** Parked, not recommended: deletion is plausible under the pre-release "remove it when it's wrong" rule, but it is an explicit charter Open direction (#2) and settling it sets precedent for every sibling event capability that copied the pattern. A North-star call for the user, not an autonomous sweep. → routed to Open directions below.

## Approved

_None. Approval is the user's verbal gate; this file's Approved ledger is filled only when the user blesses an item._

## Notes for the charter's Open directions

The delta surfaces (or re-confirms) these, all already gestured at in `charter.md` and none safe to act on autonomously:

- **#2 — `_signalSubscriptions` stub.** The delta keeps the never-populated unsubscribe map (`share.ts:80-83`, `:173-175`). Cut-or-keep, and whether the suite event-capability template should carry this scaffolding at all, wants a North-star line.
- **#1 — thin invoker vs. a `share-formats` neighbor.** `ShareFile` as a portable data-URL descriptor (browser-File-agnostic, converted inside the web backend) is implemented exactly as the charter prefers; whether a screenshot→`ShareFile` constructor earns a sibling cell (pulling `surface`/`resources`) remains an open ruling.
- **#3 — result-variant symmetry.** The delta ships `shareText`/`shareUrl` as `boolean`-only with `shareContentWithResult` as the escape hatch and no `*WithResult` twins — the deliberate surface-size question the charter parks.
- **Doc drift.** The Package Map line in `tools/agents/docs/index.md` ("native share sheet") and the prior 88/100 review describe a realized surface this integration head does not actually contain. A doc revision is owed once the types land — for the user's gate, not edited here.
