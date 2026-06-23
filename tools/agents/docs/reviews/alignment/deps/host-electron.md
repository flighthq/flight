# Dependency Alignment: @flighthq/host-electron

**Verdict:** Clean — declared deps exactly match used deps (17/17, all pinned `"*"`), no `@flighthq/sdk` edge, no phantom `electron` dependency, `@flighthq/types` imported type-only; the dependency map reads exactly as the package's purpose predicts.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `electron` (peer/runtime) | Correctly **not** declared. The package types against a local `ElectronApi` interface in `electronModule.ts` and the consumer injects `electron` via `registerElectronBackends(electron)`. This is the mandated pattern (CLAUDE.md host-electron note); no phantom dep, package stays unit-testable with a fake. | None — exemplary. |
| Info | `ElectronApi` local interface | `ElectronApi` and its sub-interfaces are defined inline in `electronModule.ts`, not in `@flighthq/types`. This is **correct**: it is the adapter's private contract describing the slice of Electron's surface Flight depends on, not a Flight cross-package type. Keeping it local is the documented design and avoids leaking a host vendor's shape into the header layer. | None. |
| Info | `@flighthq/signals` edge | `electronWindow.ts` imports `emitSignal` to fire `ApplicationWindow` signals on OS-originated window events. Slightly less obvious than the per-capability `set*Backend` edges, but legitimate and explained by the windowing model (the window backend owns the OS-window↔`win` mapping and emits its signals directly). | None. |
| Info | `@flighthq/application` edge | `electronRegister.ts` imports `setWindowBackend` (the window seam lives in `application`, not a standalone `window` package). Predictable once you know windowing is owned by `@flighthq/application`. | None. |
| Info | Layering / role | This is a `host-*` adapter: non-tree-shakable by design, depending **down** into every capability package whose `*Backend` seam it fills. All 15 capability edges + `signals` + `types` are predictable from the description. `"sideEffects": false` is accurate (all exports are pure factory/register functions; no top-level registration), even though the adapter itself is consumed wholesale rather than tree-shaken. | None. |

No boundary violations: no edge reaches across a sibling backend, and nothing reaches "up" a layer. No inline cross-package type redefinitions. All `@flighthq/types` imports use `import type` on their own lines.

## Declared vs used

`npm run packages:check` passes (86 packages, 16 examples valid). Beyond it:

- **Unused declared deps:** none. All 17 declared `@flighthq/*` deps are imported in non-test src.
  - Capability seams (15): `app`, `application`, `clipboard`, `dialog`, `ipc`, `menu`, `notification`, `platform`, `power`, `protocol`, `screen`, `shell`, `shortcut`, `tray`, `updater` — each via its `set*Backend` in `electronRegister.ts`.
  - `signals` — `emitSignal` in `electronWindow.ts`.
  - `types` — type-only across all `electron*.ts` backend files.
- **Phantom (used-but-undeclared) deps:** none. Every imported `@flighthq/*` specifier is declared. `electron` is intentionally undeclared and injected (not a phantom).
- **Pinning:** all workspace deps pinned `"*"`; `typescript` is the only non-workspace dep (devDependency). Correct.
