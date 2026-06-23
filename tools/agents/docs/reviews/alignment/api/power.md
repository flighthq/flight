# API Alignment: @flighthq/power

**Verdict:** Strongly aligned — names, sentinels, out-params, and teardown verbs all follow convention and the event-package shape mirrors `@flighthq/network`/`@flighthq/lifecycle` almost 1:1; the only real gaps are a missing `Readonly<Power>` on entity params and an unreleased module-global wake-lock.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Medium | `attachPower(power: Power)`, `detachPower(power: Power)`, `disposePower(power: Power)` | The `Power` entity param is mutable-by-default. None of these functions mutate `power`'s fields (they read its signal refs and key a `WeakMap`), so per the "Readonly everywhere mutation isn't intended" rule the param should be `Readonly<Power>`. This is a family-wide drift — `@flighthq/network` and `@flighthq/lifecycle` have the identical untyped param — so fix it consistently across the event-package set, not just here. | Change signatures to `Readonly<Power>`; `emitSignal`/`WeakMap` access work fine through a readonly reference. |
| Low | `createWebPowerBackend` / `disposePower` | The web backend stores the screen wake-lock in a module-global `_wakeLockSentinel`, a real OS resource. `disposePower` only detaches subscriptions (correct `dispose` semantics for the entity), but nothing releases a held wake-lock except an explicit `setPowerKeepAwake(false)`. The acquired native lock can outlive every `Power` entity. | Acceptable as-is if keep-awake is deliberately a global toggle decoupled from entities; otherwise document that the wake-lock is process-global and released only via `setPowerKeepAwake(false)`, or expose a backend teardown that releases it. |
| Low | `setPowerKeepAwake(enabled): boolean` | `set*` on what is really a request/command that returns a "honored" flag rather than writing a stored value. It is internally consistent (pairs with `PowerBackend.setKeepAwake`) and matches the backend verb, so this is naming taste, not a violation. | Optional: consider `requestPowerKeepAwake` if the request/honor semantics (can silently fail, returns `boolean`) should read as a command rather than a setter. Keep `set*` if symmetry with the backend method is preferred. |
| Info | `getPowerBackend()` | A `get*` accessor that lazily allocates the web default on first call. This bends the "`get*` does not allocate" guideline, but it is the established, documented family pattern (`getNetworkBackend`, `getLifecycleBackend`) for the always-present backend seam and the comment states it. No change. | None — note only; the lazy-default accessor is a deliberate suite-wide pattern. |

## Clean

- **No abbreviations.** Every exported name carries the full type word: `attachPower`, `createPowerStatus`, `createWebPowerBackend`, `getPowerStatus`, `setPowerBackend`. No `Pwr`/`Stat`/`Bkd` shortening.
- **Globally unique.** No root-barrel collisions; the only "Power" substring elsewhere is `nextPowerOfTwo` in `@flighthq/math` (different word stem, not the `Power` type).
- **Allocation by verb.** `create*` allocate (`createPower`, `createPowerStatus`, `createWebPowerBackend`); `getPowerStatus(out)` fills a caller-provided `out` and allocates nothing — correct out-param discipline.
- **out-param alias-safety.** `getStatus(out)` reads only closure-cached locals (`cachedLevel`, `cachedCharging`) before writing `out` fields, so `out` aliasing any input is safe; `createPowerStatus` returns a fresh object.
- **Sentinels, never throws.** `batteryLevel: -1` for unreported charge, `setKeepAwake`/`setPowerKeepAwake` return `false` when unavailable, `subscribe*` returns a no-op unsubscribe when the API is absent. No thrown errors for expected-missing cases anywhere.
- **Teardown verbs.** `disposePower` correctly means detach→GC (delegates to `detachPower`); no misuse of `destroy*`, and `attach`/`detach` are a clean lifecycle pair.
- **Accessor/boolean prefixes.** `get*` for snapshot/backend reads; the backend's online-style boolean would be `is*` (the entity exposes none here, matching the event-only surface).
- **Verb & parameter-order consistency.** The export set is a near-exact structural match of `@flighthq/network` (`attach`/`create`/`createStatus`/`createWeb*Backend`/`detach`/`dispose`/`get*Backend`/`get*Status(out)`/`set*Backend`), giving strong cross-package symmetry for the event-capability family.
- **Type hygiene.** `import type { Power, PowerBackend, PowerStatus }` is on its own line, separate from the value import; all cross-package types come from `@flighthq/types` (`packages/types/src/Power.ts`), none defined inline. The `onChange` payload is correctly `Readonly<PowerStatus>` and `PowerBackend.getStatus(out)` correctly leaves `out` mutable.
- **Exports alphabetized** within `power.ts`; `order:check` clean.
