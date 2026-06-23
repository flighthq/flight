# API Alignment: @flighthq/host-electron

**Verdict:** Strongly aligned — the exported surface is a clean, symmetric `createElectron*Backend` family plus one bulk `registerElectronBackends` and one `getElectronBrowserWindow` escape hatch; no naming, verb, sentinel, or `Readonly` violations found, only a couple of minor judgment-call notes.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Low | `getElectronBrowserWindow(win)` | Returns the locally-defined `ElectronBrowserWindow` type through the public barrel. This is correct by design (the package documents `ElectronApi`/`ElectronBrowserWindow` as local on purpose so `@flighthq/types` stays implementation-free and the package needs no `electron` dep), but it does mean a consuming app's type surface depends on Flight's hand-rolled Electron slice rather than Electron's own types. No action needed unless the slice drifts from Electron; just confirm the local interface stays a faithful subset. | Keep as-is; ensure `ElectronBrowserWindow` members stay a structural subset of Electron's `BrowserWindow` so the cast at the call site (`import * as electron`) stays sound. |
| Low | `getElectronBrowserWindow(win)` | Casts `win as ApplicationWindow` to index a `WeakMap<ApplicationWindow, …>` whose key was inserted as a mutable `ApplicationWindow` in `open()`, while the parameter is `Readonly<ApplicationWindow>`. The cast is benign (read-only lookup, identity-keyed `WeakMap`) and the `Readonly` parameter is the correct convention, but the cast is a small seam worth a one-line comment noting it is identity-lookup-only. | Add a short comment at the cast explaining it is an identity-based `WeakMap` read, not a mutation, so the `Readonly`→mutable cast does not look like an oversight. |
| Info | `WindowBackend.getBounds(win, out)` | Out-param fallback path reads `win.x/y/width/height` while writing `out.x/y/…`. This is alias-safe because `win` and `out` are necessarily distinct objects (one is the entity, one is the caller's `Rectangle`), and the happy path reads `bw.getBounds()` into a `bounds` local before writing — so no read-after-write hazard exists. Noted only to confirm the alias-safety rule was checked. | No change. |

## Clean

- **Full, unabbreviated type words in every name.** `createElectronClipboardBackend`, `createElectronNotificationBackend`, `createElectronBrowserWindow` — no `Btn`/`Win`/`Cfg`-style abbreviations. `getElectronBrowserWindow` spells out the full `BrowserWindow` type word.
- **Globally unique, self-identifying root exports.** All 15 backend factories share the `createElectron<Capability>Backend` shape; each is unique and reads unambiguously from the barrel. `registerElectronBackends` and `getElectronBrowserWindow` are distinct, descriptive, and collision-free.
- **Verb consistency.** A single allocation verb (`create*`) for every backend factory, matching the documented host-adapter pattern (`createElectron*Backend` per capability) and the codebase's "create may allocate" rule. `register*` is used correctly for the opt-in install function; no `make`/`new`/`build` drift.
- **No top-level side effects.** Registration is exposed only through `registerElectronBackends`/individual `set*Backend` calls; nothing registers at module load, honoring `"sideEffects": false`.
- **Sentinels, not throws, for expected failure.** `getElectronBrowserWindow` returns `null` when unopened; the window/clipboard/dialog/shell/menu backends return `''`/`[]`/`null`/`false`/no-op and wrap risky native calls in `try/catch` so a destroyed window cannot throw across the seam. No expected-missing case throws; no internal-invariant validation.
- **`Readonly<T>` on non-mutated object params.** `getElectronBrowserWindow(win: Readonly<ApplicationWindow>)`, `toMenuItemOptions(item: Readonly<MenuItemTemplate>)`, and `fillScreenInfo(display: Readonly<ElectronDisplay>)` all mark read-only inputs; mutable outputs are named `out`.
- **Out-param discipline.** `getBounds(win, out)` and `fillScreenInfo(out, …)` write into a caller-supplied target and return it; the alias-relevant path reads inputs into locals first.
- **Type imports isolated.** Every cross-module/cross-package type import is on its own `import type { … }` line (`import type { ApplicationWindow, WindowBackend } from '@flighthq/types'`); no inline `import { type Foo, bar }` anywhere.
- **Backend types sourced correctly.** All `*Backend` return types come from `@flighthq/types`; the only locally-defined types (`ElectronApi` and its members) are the deliberate, documented host-coupling slice that must not live in `@flighthq/types`.
- **Exports alphabetized** within `index.ts` and within each source file; `order:check` has nothing to add here.
