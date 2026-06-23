# Dependency Alignment: @flighthq/filters-surface

**Verdict:** Clean — three declared deps (`@flighthq/filters`, `@flighthq/surface`, `@flighthq/types`), all used, all pinned `*`, no phantom or unused edges, no inline cross-package types, no barrel import; the dependency mapping reads exactly as the package's role predicts.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | — | No issues found. `npm run packages:check` passes (86 packages valid) and judgment adds nothing it missed. | — |
| Info | `@flighthq/filters` | Used only for `computeBoxBlurRadius` (8 of 14 filter files). This is the correct edge, not an over-dependency: `filters` is the backend-agnostic filter math/descriptor layer, and the surface backend legitimately reuses its blur-radius math. The function originates in `filters` (`blurMath.ts`), not re-exported from elsewhere, so the dependency is genuine and minimal. | None needed. |
| Info | `@flighthq/surface` | Provides every CPU pixel primitive the backend wraps (`createSurface`, `gaussianBlurSurface`, `bevelSurface`, `glowSurface`, `buildSurfaceGradientRamp`, etc.). The package name `filters-surface` predicts exactly this edge. | None needed. |
| Info | `@flighthq/types` | All type imports (`SurfaceRegion`, `BevelFilter`, `BlurFilter`, …) come from the header layer via `import type` only — no value import from `types`, no inline cross-package type definitions anywhere in src. Pulls zero runtime weight; `"sideEffects": false` is declared and the barrel is a thin re-export. | None needed. |

Layering is respected: `filters-surface` is a `<subject>` backend leaf that composes the `filters` math layer with the `surface` pixel layer. It does not import `@flighthq/sdk`, does not reach "up" a layer, and does not depend on any sibling backend (canvas/dom/gl/wgpu). The leaf does not depend on the abstract render core (`@flighthq/render`) — correct here, since these are pure pixel transforms invoked directly, not renderer registrations.

## Declared vs used

- **Unused declared deps:** none. All three (`@flighthq/filters`, `@flighthq/surface`, `@flighthq/types`) are imported in src.
- **Phantom (used-but-undeclared) deps:** none. Every `@flighthq/*` import resolves to a declared dependency. No external (non-`@flighthq`) runtime imports exist.
- **Pinning:** all workspace deps pinned `"*"` as required. `typescript` is the only devDependency.
