# API Alignment: @flighthq/shortcut

**Verdict:** Clean, idiomatic command-capability seam — fully conformant except a `handler`/`listener` parameter-name drift and a benign two-vocabulary split (`GlobalShortcut` operations vs `Shortcut` backend accessors).

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `registerGlobalShortcut(accelerator, handler)` | Callback parameter is named `handler`, but the backing `ShortcutBackend.register(accelerator, listener)` interface and every sibling event/command capability name the callback `listener` (`onMenuSelect(listener)`, `onTrayEvent(listener)`, `subscribeSelect(listener)`). Same concept, different word at the public seam. | Rename the public parameter to `listener` for cross-package verb/param consistency, matching the interface it delegates to. |
| Info | `getShortcutBackend` / `setShortcutBackend` / `createWebShortcutBackend` vs `registerGlobalShortcut` / `unregisterGlobalShortcut` / `unregisterAllGlobalShortcuts` / `isGlobalShortcutRegistered` | Two noun families coexist: backend accessors use `Shortcut`, the operations use `GlobalShortcut`. Not a defect — it matches the suite-wide `<Capability>Backend` seam convention (clipboard/shell use the same `get<Capability>Backend` shape) and "global shortcut" is the canonical OS hotkey term — but worth recording so the asymmetry is understood as intentional. | No change. The operation verbs correctly carry "Global" (these are OS-global hotkeys, distinguishing them from any future in-app shortcut), and the backend keeps the bare capability noun. |

## Clean

- **Full, unabbreviated type words.** `registerGlobalShortcut`, `unregisterGlobalShortcut`, `unregisterAllGlobalShortcuts`, `isGlobalShortcutRegistered`, `getShortcutBackend`, `setShortcutBackend`, `createWebShortcutBackend` — nothing abbreviated; `accelerator` is the canonical (Electron) hotkey-string term.
- **Globally unique exports.** All seven root names are `*Shortcut*`-scoped; no collision risk with sibling packages.
- **Sentinels, never throws.** Every expected-failure path returns `false` (`register`/`unregister`/`isRegistered`) or is a no-op (`unregisterAll`); the web backend returns sentinels rather than throwing for the unsupported case, exactly as the seam contract requires. No precondition/invariant throws.
- **Boolean prefix.** `isGlobalShortcutRegistered` (and interface `isRegistered`) correctly use `is*` and return `boolean`; no `get*` returning a boolean.
- **Verb consistency with the suite.** `create*Backend` / `get*Backend` / `set*Backend` mirror `@flighthq/clipboard` and `@flighthq/shell` one-for-one — the established command-capability shape. `register`/`unregister` are the correct register/unregister pair, not synonym drift.
- **No teardown-verb misuse.** Uses `unregister*` for the register/unregister bracket; correctly avoids `dispose*`/`destroy*`/`release*` (no GC-reachability detach, no owned non-GC resource, no pool).
- **Types from `@flighthq/types`.** `ShortcutBackend` is imported via a standalone `import type { ShortcutBackend } from '@flighthq/types';` line — not defined inline, not mixed with a value import.
- **No allocation-discipline issues.** `createWebShortcutBackend` is the only allocator and is correctly `create*`-prefixed; the operation functions allocate nothing and need no `out` params (no hot-path math here).
- **Source style.** Loose module var `_backend` sits at the bottom after the exported functions; lazy web default via `getShortcutBackend`; no module-top-level side effects (`"sideEffects": false` honored — backend install is via explicit `setShortcutBackend`).
- **Readonly.** No object parameters require `Readonly<>` — inputs are primitives (`string`) and a callback; the backend setter takes a `ShortcutBackend | null` it stores, which is correctly mutable-by-intent (it is the stored reference).
