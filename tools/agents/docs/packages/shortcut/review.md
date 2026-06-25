---
package: '@flighthq/shortcut'
status: partial
score: 30
updated: 2026-06-25
ingested:
  - status.md
  - reviews/depth/shortcut.md
  - reviews/maturation/depth/shortcut.md
  - source
  - base=origin/main(eb73c3d74)
  - evidence=integration-b2824e3d8 delta (changes.patch + head tree)
---

# Review: @flighthq/shortcut — MERGE GATE (integration b2824e3d8 vs approved origin/main eb73c3d74)

## Verdict

**REJECT as a merge gate — `partial / 30`.** Judged in isolation, the package-side rewrite is a strong piece of work: 26 alphabetized free functions, an accelerator value core (parse / normalize / format / validate / equality), an opt-in `onTrigger` signal group, and 96 colocated tests. **But the integration delta does not type-check**, because the implementation was merged without the `@flighthq/types` half it is written against. `b2824e3d8:packages/shortcut/src/shortcut.ts` imports six types and calls three backend methods that **do not exist anywhere in the integration tree**. The score is not a judgment of the design — it is the cost of an unbuildable merge.

This contradicts the carried-over builder docs (review.md/status.md in `changes.patch`), which claim "**Types added to `@flighthq/types` — VERIFIED**". That claim is false against this integration head: `changes.patch` contains **no** `packages/types/` hunk for shortcut, and the integration `head/packages/types/src/Shortcut.ts` is byte-identical to base.

## What the integration delta actually contains

`changes.patch` for `packages/shortcut/` touches exactly four files, nothing else:

- `package.json` — adds `@flighthq/signals: "*"` to `dependencies` (only delta).
- `tsconfig.json` — adds `{ "path": "../signals" }` reference.
- `src/shortcut.ts` — full rewrite (54→572 lines, 7→26 exports).
- `src/shortcut.test.ts` — full rewrite (96 `it()`, 26 `describe`).

It does **not** touch `packages/types/src/Shortcut.ts`, does **not** add `packages/types/src/ShortcutSignals.ts`, and does **not** update `packages/host-electron/src/electronShortcut.ts`. Verified: `find head/packages/types -iname 'ShortcutSignals*'` → nothing; `grep "getRegistered|setEnabled|ShortcutEvent" head/packages/host-electron/src/*.ts` → nothing.

## Blocking (the build is broken)

- **Six imported types are undefined in `@flighthq/types`.** `b2824e3d8:packages/shortcut/src/shortcut.ts:2-10` does `import type { Accelerator, AcceleratorParseError, ParsedAccelerator, ShortcutBackend, ShortcutEvent, ShortcutModifier, ShortcutSignals } from '@flighthq/types'`. In the integration head, `packages/types/src/Shortcut.ts` exports **only** `ShortcutBackend` (4 methods). `Accelerator`, `AcceleratorParseError`, `ParsedAccelerator`, `ShortcutEvent`, `ShortcutModifier`, `ShortcutSignals` are not exported by `@flighthq/types` anywhere — a grep of `head/packages/types/src` for any of them returns nothing. TS2305 on the import line; the package cannot compile.

- **`ShortcutBackend` is called with 7 methods but the interface has 4.** `createWebShortcutBackend` (`:29-53`) returns `getRegistered`, `setAllEnabled`, `setEnabled` in addition to `register`/`unregister`/`unregisterAll`/`isRegistered`, and `getRegisteredGlobalShortcuts` (`:133`), `disableGlobalShortcut` (`:60`), `suspendAllGlobalShortcuts` (`:235`) call `getRegistered()` / `setEnabled(...)` / `setAllEnabled(...)` on the backend. The integration `ShortcutBackend` (`head/packages/types/src/Shortcut.ts`) declares none of those three methods. The web-backend literal mismatches `ShortcutBackend` and every call site is TS2339.

- **The test imports a non-existent signals export.** `b2824e3d8:packages/shortcut/src/shortcut.test.ts:1` does `import { connectSignal, disconnectAllSlots } from '@flighthq/signals'`. `@flighthq/signals` exports `disconnectAllSignals` and `disconnectSignal` — there is **no** `disconnectAllSlots`. `afterEach` (`:79-84`) calls `disconnectAllSlots(signals.onTrigger)`. TS2305; the colocated test does not compile, so `tsc -b` (which typechecks `src/*.test.ts`) fails the package.

- **`emitSignal(_signals.onTrigger, event)` is downstream of the missing `ShortcutSignals`.** `:210` emits a payload into `onTrigger`, which `enableGlobalShortcutSignals` creates with a bare `createSignal()` (`:76`). Whether this typechecks depends entirely on the missing `ShortcutSignals.onTrigger: Signal<(event: Readonly<ShortcutEvent>) => void>` type. Resolving the blocking item above (restore the types) must also make this arity correct — `createSignal()` with no type argument infers `Signal<() => void>`, which would reject the `event` argument.

## Sharp edges that survive even once the types are restored (within-package, minor)

- **Dead `'Enter'` display entry.** `_keyDisplayNames` maps `'Enter' → '↵'` (`b2824e3d8:packages/shortcut/src/shortcut.ts:446`), but `enter` aliases to the canonical key `'Return'` (`:360`, also mapped at `:458`). `_parse` only ever produces canonical keys, so a parsed key is never the literal `'Enter'`; the entry is unreachable dead data in the table presented as the display source of truth.

- **`getRegisteredGlobalShortcuts` trust cast.** `:133` casts the backend's `readonly string[]` to `readonly Accelerator[]` on the assumption the registry already holds normalized strings. True for the path where `registerGlobalShortcut` normalizes first, but a native host populating the registry by another route could return non-normalized strings and the cast hides it. A `normalizeAccelerator`-over-the-list pass would earn the type instead of asserting it.

- **`CommandOrControl` sort tie.** The normalize sort (`:553-557`) maps `CommandOrControl` onto `Control`'s index (`_modifierOrder`, `:256`, 5 entries), so a chord containing both `Control` and `CommandOrControl` ties and the canonical order between them is input-dependent — the canonical form is not fully canonical for that (pathological) input. Giving `CommandOrControl` its own ordinal fixes it and is correct whether the charter later resolves or preserves `CommandOrControl`.

## Contract & docs fit (package side, on the assumption the types land)

Where it can be judged without the missing header, the package honors the contract: full unabbreviated export names (`registerGlobalShortcut`, `getAcceleratorModifierLabel`); out-params with documented alias-safety (`parseAccelerator` / `parseAcceleratorDetailed` / `getAcceleratorModifiers` read inputs into locals before writing, and the test exercises the aliased case at `:613-621`); sentinels not throws (`null` for unparseable, `false`/`[]`/no-op web sentinels, `AcceleratorParseError` **returned** not thrown); single root `export * from './shortcut'`; `sideEffects: false`; signals lazily allocated (no module-top-level side effect); exports and `describe` blocks alphabetized and mirrored 1:1. The `@flighthq/signals` dependency is new (base was `@flighthq/types`-only) and is the kind of thing the charter should bless, but it is a small, lazily-paid cost.

The decisive contract violation is the **types-first** rule: the cross-package accelerator model was implemented inline-dependent on `@flighthq/types` symbols that were never added there. In this integration tree the header layer is silent and the package speaks a vocabulary that does not exist.

## Diagnosis

This is a **partial / botched integration**, not a bad package. The implementing commits landed; the `@flighthq/types` (`Shortcut.ts` extension + new `ShortcutSignals.ts`) and `host-electron` commits the same worker produced did not make it into `b2824e3d8`. The carried-over `review.md`/`status.md` were ingested from the worker's own bundle (`incoming/builder-67dc46d64`) and never re-verified against the integration head — which is why they assert "VERIFIED" for changes that are absent here. This is the same failure mode as `@flighthq/clipboard` in this same integration branch (see `outgoing/integration/clipboard.md`).
