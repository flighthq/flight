---
package: '@flighthq/host-lime'
role: host
crate: null
draft: true
lastDirection: null
downstream: flight-hx
---

# host-lime — Charter (DRAFT)

> **Built in `flight-hx`, not this monorepo.** No `packages/host-lime/` here, and none should be
> scaffolded: unlike `host-electron` / `host-tauri` / `host-capacitor`, whose runtimes expose a
> JavaScript API that a TS package can wrap, Lime has none — a TS package here could hold no
> implementation. This cell records the name, the boundary, and the seams Flight owes it. The
> `downstream` marker keeps it out of the chartered-unbuilt queue and liveness checks. Unblessed.

## What it is

The Lime host adapter — the fourth member of the `host-<runtime>` family. Supplies native
implementations of Flight's platform-suite capability seams by calling `set*Backend` at an explicit
registration door, exactly as the three existing host packages do. Outside the `@flighthq/sdk`
barrel and not tree-shakable, per `scripts/sdk-policy.ts`.

## Boundary

A host package is a bundle of `set*Backend` implementations and nothing else. It adds no
capability, defines no type, and owns no policy — its dependency list *is* the inventory of seams it
fills. Anything a Lime host needs that is not expressible as an existing seam is a gap in Flight,
not work for this package.

## What Flight owes it

The seams already exist and are the reason this is tractable: **39 `set*Backend` seams** across the
platform suite, of which `host-electron` fills ~15, `host-capacitor` ~12, and `host-tauri` ~10.
Lime picks the subset it can serve; web backends return sentinels for the rest.

One genuine gap blocks a complete host, and it is not Lime-specific:

- **No `ImageBackend`.** `loadImageResourceFromUrl` hardwires `new Image()` + `img.decode()`
  (`packages/image/src/imageResourceFrom.ts`), and no `host-*` package can swap image loading —
  none of the three even depends on `@flighthq/image`. `@flighthq/net` next door already has the
  canonical `createWebNetBackend` / `getNetBackend` / `setNetBackend` triad to copy. Tracked in the
  image cell's [assessment](../image/assessment.md) as a parked cross-package design item; a native
  host makes it concrete. This is contract clarity, not port tax — see
  [port-readiness](../../port-readiness.md#first-sort-the-ask-contract-clarity-or-mechanism-accommodation).

## Open

1. **Which subset Lime serves.** Should be declared up front rather than discovered from what
   compiles, so the sentinel-returning remainder is a decision instead of an omission.
2. **The frame driver is already inverted** — `LoopBackend` (`requestFrame` / `cancelFrame` / `now`)
   and the distinct application-visibility query exist for exactly this, and a native host supplies
   both slots while driving the same callbacks from its own loop. A Lime host should pass its Host
   value to `startApplicationLoop`, not use deterministic `stepApplicationLoop` as its frame driver.
3. **Verification is downstream.** Nothing here imports a real host runtime — the existing
   `host-*` tests run against fakes satisfying the seam. Conformance against real Lime belongs in
   `flight-hx`.
