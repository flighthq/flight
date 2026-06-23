# Dependency Alignment: @flighthq/platform

**Verdict:** Clean — a textbook seam package; the single declared dep (`@flighthq/types`, type-only, pinned `*`) is exactly what the package's role predicts, with nothing missing, unused, or surprising.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Sole runtime dep; imported type-only (`import type { PlatformBackend, PlatformInfo, PlatformKind, PlatformName }`). All four types are defined canonically in `packages/types/src/Platform.ts`, not redefined inline. Correct header-layer usage. | — |
| None | barrel / sdk | No import of `@flighthq/sdk`. `index.ts` is a thin `export * from './platform'`. | — |
| None | tree-shaking | `sideEffects: false`; no top-level side effects (backend resolves lazily via `getPlatformBackend`, `setPlatformBackend` is opt-in). Type-only import pulls zero runtime weight. | — |
| None | layering | Root identification seam at the bottom of the platform-integration suite — depends only on the header, reaches across no boundaries, sits below every other capability package. Edge is fully predictable from purpose. | — |

`npm run packages:check` passes (86 packages, 16 examples valid). Judgment beyond it: the dependency mapping is the ideal case — a reader could predict `@flighthq/types` as the only edge from the package description alone, and the type-only import keeps the seam weightless. No phantom or unused deps to flag.

## Declared vs used

- **Declared:** `@flighthq/types` (`*`), `typescript` (dev).
- **Used:** `@flighthq/types` (type-only, in `platform.ts` and `platform.test.ts`).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. The only runtime/library reference is `navigator` (a DOM ambient global, no package dependency).
- **Pin convention:** workspace dep pinned `*` as required.
