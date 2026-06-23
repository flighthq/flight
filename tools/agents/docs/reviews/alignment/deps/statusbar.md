# Dependency Alignment: @flighthq/statusbar

**Verdict:** Clean — a single `import type` edge to `@flighthq/types`, correctly declared and minimal; no issues beyond what `npm run packages:check` (passing) already enforces.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (`*`) | Only runtime-declared dep; used as the sole import, `import type`-only, pinned `*`. Types (`StatusBarBackend`, `StatusBarStyle`) live in the header layer (`packages/types/src/StatusBar.ts`), not redefined inline. | — |
| None | `@flighthq/sdk` | Not imported. | — |
| None | `sideEffects` | Declared `false`; no module-top-level side effects (backend lazily created on first `getStatusBarBackend` call, never at import). | — |

Observations that judgment adds beyond `packages:check`:

- **Dependency mapping reads cleanly.** A reader can predict the deps from the package's purpose: a platform-suite command capability is a thin layer of free functions over a `*Backend` seam, so its only dependency is the header package that defines that seam. No surprising edges, no reach across the platform suite, no renderer/graph coupling.
- **type-only is genuinely type-only.** The single `@flighthq/types` import is `import type`, so it pulls zero runtime weight — the compiled output has no inter-package runtime dependency at all, consistent with the platform-suite pattern. `StatusBarStyle` also appears as a value-position type annotation in `createWebStatusBarBackend`, still type-only.
- **No phantom deps.** The web backend touches only ambient DOM globals (`document`), which are correctly guarded (`typeof document === 'undefined'`) rather than declared as a dependency — appropriate for a lazily-available web default. Bit-twiddling color helper (`packedRgbaToHexColor`) is local, not imported from `@flighthq/geometry` or similar, which is the right call for a one-line packed-RGBA→hex conversion.
- **Layering respected.** Sits at the platform-integration layer; depends only "down" on the header. No edges to peer capabilities (`@flighthq/device`, `@flighthq/platform`) or to host adapters.

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is used; `typescript` (dev) is the build toolchain.
- **Phantom (used-but-undeclared) deps:** none. All imports resolve to the declared `@flighthq/types`; DOM globals are ambient, not package imports.
- **Pinning:** workspace dep `@flighthq/types` pinned `"*"` per convention.
