---
package: '@flighthq/application'
updated: 2026-06-25
basedOn: ./review.md
---

# application — Assessment (merge gate, integration b2824e3d8)

Possible changes, sorted by sweep-safe (within-package, non-design-decision) vs. parked (coordination/decision needed). Design forks and cross-package boundaries live in the charter's Open directions, not here. `Approved` is frozen on your verbal blessing only.

This assessment reasons over `./review.md`, which re-scored **the integration assembly at b2824e3d8** (not the standalone `67dc46d64` build the prior assessment covered). The headline is that the merge as staged is broken: the `application` source landed without the `@flighthq/types` half it depends on. The fixes below are all about closing that gap, plus one local cleanup — nothing here is a new feature.

## Recommended (sweep-safe, within `@flighthq/application` and its `@flighthq/types` header)

These are mechanical and required for the delta to compile; they do not need a direction ruling.

- **Land the missing `@flighthq/types` symbols in the same merge.** Add the `LoopBackend` type, the `ApplicationLoopOptions` type, the expanded `Application` interface fields (`deltaTime`/`elapsedTime`/`frameCount`/`interpolationAlpha`/`isRunning`/`windows` + the nullable `onActivate`/`onDeactivate`/`onError`/`onFixedUpdate` signals), and the three `WindowBackend` methods (`setContentProtection`/`flashWindowFrame`/`setHasShadow`). Without these the source does not typecheck (review.md findings 1–3). This is the merge-blocker; it is "sweep-safe" only in that the shapes are already fully implied by the implementation — no design choice remains.
- **Remove the dead `LoopState.accumulated` field** and fix the stale comment that still lists it (`application.ts:212/359/373`). Pure cleanup.

## Backlog (parked — coordination, decision, or larger than a within-package sweep)

- **Split `ApplicationLoopOptions` into its own `ApplicationLoopOptions.ts`** — parked because it is a `@flighthq/types`-layout call (one-concept-per-file vs. "loop-config is one concept with `LoopBackend`") that belongs to the types-layout checker / the charter's Open directions, not an autonomous edit. Do it only once the types half lands (it presumes the file exists).
- **A types-first existence check** (CI catches an implementation importing a `@flighthq/types` symbol that does not exist) — parked because it is a tooling change outside this package; surface to whoever owns `packages:check`. It would have caught this entire merge regression.

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here until you bless it._

## Notes for the charter's Open directions

The design forks this delta touches are unresolved and are the user's to rule on — they do not block the merge fix, but they shape whether the landed surface is the final shape:

- **Seams shipped ahead of a native consumer.** `LoopBackend`, `getWindowDisplay` (`window.ts`, returns `-1`), and the three new `WindowBackend` methods are realized only by the web no-op default. The charter's "authoritative requires an exercised seam" question applies directly — is shipping a seam before its `host-*` fill the accepted posture, or should a native backend land alongside?
- **Phase scheduler vs. self-scheduling consumers** (fork C), **loop-driver placement** (`application` vs. `host-*`, fork D), **`semiFixed`/`TimestepMode`**, the **`@flighthq/app` lifecycle boundary**, and the **uncaught-error sink** (`onError` is null unless `enableApplicationLifecycleSignals` runs) — all already enumerated in the charter's Open directions; this delta neither resolves nor regresses them.
