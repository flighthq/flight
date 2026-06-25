---
package: '@flighthq/device-formats'
updated: 2026-06-25
basedOn: ./review.md
---

# device-formats — Assessment

Reasoned over `./review.md` (merge gate: integration-b2824e3d8 head vs approved base origin/main eb73c3d74). The dominant finding is structural, not within-package: `device-formats` is a **blessed `rejected`** boundary (`register.md:30`), to be collapsed into a shared `useragent` value-leaf. Almost nothing here is sweep-safe, because the sweep-safe surface of a package the register says should not exist is nearly empty — and the one hard code defect (phantom `DeviceFormFactor` imports) is fixed in `@flighthq/types`, a different package.

## Recommended (sweep-safe, within-package)

_Effectively none._ The within-`device-formats` surface that is both sweep-safe and worth doing in isolation is empty: the package's parsers are good as written, and the only actionable defects either (a) require the `useragent` collapse, which is a cross-package design fork, or (b) require authoring types in `@flighthq/types`, which is a different package. Recommending a within-package tidy here would polish a boundary the register has already condemned.

## Backlog (parked — each with why)

- **Collapse `device-formats` + `platform-formats` → `useragent`.** _Why parked:_ cross-package structural fork; removes a package the `device` and `platform` runtimes both depend on; the register (`register.md:30-31,36`) records the verdict but the execution needs the user's explicit bless. Routed to Open directions below.
- **Author the `DeviceFormFactor` type + 7 `DeviceFormFactor*` constants in `@flighthq/types`.** _Why parked:_ the fix lives in `@flighthq/types`, not `device-formats`; out-of-package by the cell's editing scope. It is nonetheless a hard merge blocker — the delta does not compile without it (review.md, blocker 2). Surfaced as a directive in the dispatch brief and as an Open direction.
- **Retire `device-formats/charter.md` (and the `flighthq-device-formats` crate target).** _Why parked:_ only valid _after_ the `useragent` collapse is blessed and executed; deleting the cell before the boundary decision is recorded would erase the audit trail. The register intentionally keeps the rejected entry "so it is not re-proposed" (`register.md:10`).

## Approved

_None. Approval is the user's verbal gate; this section is filled only when the user blesses an item, with the dated provenance stamp from CONTRACT.md._

## Notes for the charter's Open directions

These are forks/cross-package items, not within-package recommendations — they belong to the user's direction session, not this assessment:

- **The `device-formats` → `useragent` collapse is the load-bearing fork.** Bless or not. It is the opposite of sweep-safe: it deletes a package, re-homes two parser sets into one new `useragent` leaf, and rewires the `device` + `platform` web backends. `register.md:36` already specifies the target shape (UA-string → identity-tokens value-leaf, depends only on `types`, wasm-mixable per fork D).
- **`DeviceFormFactor` is mis-homed by omission.** Whatever package ends up owning the parsers, the `DeviceFormFactor` type + constants must be authored in `@flighthq/types` first (the header-layer rule). The current delta implements against a header contract that was never written.
- **The Package Map omits `device-formats` by intent** — do not "fix" the Map by adding it; the omission is correct for a rejected package and resolves when the `useragent` cell replaces it.
