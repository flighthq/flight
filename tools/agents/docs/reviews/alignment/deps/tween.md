# Dependency Alignment: @flighthq/tween

**Verdict:** Clean — declared deps `{easing, signals, types}` are exactly the imported set, all correctly used, pinned `"*"`, type imports use `import type`, and the dependency mapping reads exactly as a tween package should; the only note is a Low cosmetic observation about a module-level `defaultManager` singleton.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/sdk` | Not imported. No barrel dependency. | None. |
| Info | `@flighthq/types` (cross-package types) | All cross-package contracts (`Tween`, `TweenManager`, `TweenOptions`, `NumericProps`, `StopTweenOptions`, `EasingFunction`, `TweenPropertyDetail`, `TweenManagerOptions`) are imported from `@flighthq/types`. The only inline type, `ColorComponents` in `colorTween.ts`, is a purely local r/g/b interpolation helper — not a cross-package contract, so inlining it is correct. | None. |
| Info | `@flighthq/easing` | Used at runtime: `easeOutExponential` as the `defaultManager` ease (`tweenManager.ts`). Predictable edge — a tween package depending on easing is exactly the documented relationship (easing "for use with tween or any animation system"). | None. |
| Info | `@flighthq/signals` | Used at runtime: `createSignal`/`emitSignal` (`tween.ts`, `updateTweens.ts`) and `connectSignal` (`colorTween.ts`). `Tween.onUpdate`/`onComplete` are signals, so this is the documented multi-listener path, not a misuse. | None. |
| Low | `defaultManager` singleton (`tweenManager.ts:14`) | `export const defaultManager: TweenManager = createTweenManager();` allocates a `Map`-bearing entity at module-import time — shared top-level mutable state. It performs no external side effect (no registration, listeners, or global patching), so it is compatible with `"sideEffects": false` and tree-shakes away when unused, but it is the kind of ambient mutable convenience the ground rules discourage. Judgment-level note only; `packages:check` does not flag it. Consider whether `applyTween`/`createTween` should require an explicit manager rather than defaulting to a shared one. | Optional: drop the shared default and require callers to pass a manager, matching the SDK's "no shared top-level mutable state" preference. |

## Declared vs used

- **Declared:** `@flighthq/easing`, `@flighthq/signals`, `@flighthq/types` (all `"*"`), devDep `typescript`.
- **Used in `src/` (non-test):** `@flighthq/easing`, `@flighthq/signals`, `@flighthq/types`.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. Test files import only `@flighthq/signals`, which is already a declared dependency.
- **Type-only hygiene:** `@flighthq/types` and the type-only `easing`/`signals` symbols are imported via `import type`; runtime `signals`/`easing` symbols via value imports. `"sideEffects": false` is set; package stays tree-shakable.
