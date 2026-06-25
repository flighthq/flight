---
package: '@flighthq/input'
updated: 2026-06-25
basedOn: ./review.md
---

# Assessment: @flighthq/input

> Recommendation layer for the integration-b2824e3d8 merge gate. Sorts the review's findings into sweep-safe `Recommended` (within-package, no design decision) and parked `Backlog` (cross-package, larger, or blocked on an Open direction). `Approved` is frozen only on the user's verbal gate — left empty. Judged against base `origin/main(eb73c3d74)` with the integration delta as evidence; the charter is a DRAFT, so design forks route to the charter's Open directions rather than into `Recommended`.

The decisive merge finding — the input implementation depends on `@flighthq/types` shapes the integration head does not contain — is a **cross-package** fix (the change lives in `@flighthq/types`, not in `packages/input`). It therefore cannot be a within-package `Recommended` sweep; it is the headline Backlog blocker and the must-fix in the dispatch brief. Within `packages/input` itself, only naming/header polish is sweep-safe, and even that is best deferred until the package compiles.

## Recommended (sweep-safe, within-package only)

- **Give `getGamepadAxisName`/`getGamepadButtonName` a typed `mapping` parameter and an `Input`-consistent name.** Today both take a bare `mapping: string` and read `getGamepad…` while the sibling reads `getInputGamepadAxis` (review §2; `inputManager.ts` L562, L572, L581). Once `GamepadMappingKind` is the blessed mapping type, switch the parameter to it and reconcile the `getInput…`/`getGamepad…` prefix split so the whole gamepad family reads as one. Pure within-package rename + signature tighten. _(Gated on the same `@flighthq/types` landing as the blocker, so do it in that pass, not before.)_

- **Name the key-repeat-timer handle in `@flighthq/types`.** `createInputKeyRepeatTimer` returns an inline `{ start; stop }` (review §6; `inputManager.ts` L413–416). Define `InputKeyRepeatTimer` in the header layer and return it, matching the types-first rule and giving the Rust port a seam to mirror. _(Touches types, but it is a small additive type that travels with the blocker fix; group it there.)_

## Backlog (parked, with why)

- **[BLOCKER] Land the input `@flighthq/types` additions in the same integration.** The implementation imports `GamepadAxisKind`, `GamepadButtonKind`, `InputState`, `InputTextData`, `InputKeyRepeatOptions` and writes `timeStamp` (keyboard + gamepad data), `mapping` (connect data), and pointer `pressure`/`tilt`/`twist`/ `height`/`width`/`timeStamp`, plus the `InputSignals` text payload as `InputTextData` — none of which exist in head `@flighthq/types` (review §6). _Why Backlog, not Recommended:_ the fix is a `@flighthq/types` change, outside this package's tree; per the ground rules it is a cross-package item to surface, not an autonomous within-package sweep. It is the merge gate.

- **Held-state subsystem as its own primitive.** The event-stream and the queryable `InputState` snapshot are two jobs in one file (review §1). Whether to extract is the "normalization seam vs. full game-input library" call — charter Open direction #1. Parked pending that decision.

- **`InputBackend` seam for `attach*`.** Every `attach*` takes a raw DOM target, so portability is aspirational (review §5). Fork D / charter Open direction #2. A direction-session call, not a sweep.

- **`GamepadMappingKind` shape (closed union vs. registry).** Pre-existing `'standard' | 'raw' | ''` union, unchanged by the delta (review §4). Charter Open direction #6 / fork B. Parked.

- **Neighbor packages (`input-bindings`, `gestures`, `gamepad-mappings`).** New-cell decisions, charter Open direction #3, correctly untouched by the delta. Parked.

## Approved

_None. Approval is the user's verbal gate; nothing is frozen here until then._

## Notes for the charter's Open directions

- **#1 (normalization seam vs. game-input library):** the delta lands held state, frame edges, dead zones, and gamepad semantics — it commits the package decisively toward "library." The scope question is now answered in practice by code; the charter should ratify or roll it back, not leave it open.
- **#5 (signal-cost model `enableInputSignals?`):** unchanged by this delta — `createInputManager` still eagerly folds all 15 signals via `...createInputSignals()` (this is base behavior, not a delta regression). Still a bless-or-change call.
- **#6 (`GamepadMappingKind`):** the delta's bare-`string` `mapping` params make settling this more urgent — the kind type would type the new `getGamepad*Name` seam.
- **#9 (stale Package Map / `package.json` description):** `package.json` description is byte-identical to base and still omits gamepad/state/frame-edge scope; the delta widens the gap between described and actual scope.
- **TS↔Rust conformance (#7):** the new gamepad-name tables, dead-zone math, `InputState`, edge tracking, and pointer lock/capture all need Rust counterparts recorded in the divergence map; this delta enlarges the surface the map must cover.
