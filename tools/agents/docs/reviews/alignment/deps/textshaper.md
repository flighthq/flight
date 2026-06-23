# Dependency Alignment: @flighthq/textshaper

**Verdict:** Clean — the package declares exactly one dependency (`@flighthq/types`, pinned `*`, type-only), with no phantom, unused, or boundary-violating edges; `npm run packages:check` passes (86 packages valid).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (dep) | Sole runtime dep; imported `import type` only (`TextShaperBackend`, `TextFormat`), both defined in `@flighthq/types` (`types/src/TextShaper.ts`). Header-layer dependency is exactly what's expected for a seam package. | None |
| None | `typescript` (devDep) | Standard build-time toolchain dep. | None |
| Info | `sideEffects: false` | Correct. The backend registry (`let _backend`) is module-private mutable state but is initialized to `null` with no top-level side effect — registration is opt-in via `setTextShaperBackend`, per the side-effect-free rule. Tree-shakable. | None |
| Info | Mapping legibility | Edge reads cleanly: a text-shaping seam over a swappable backend, whose only types cross a package boundary, should depend on the header and nothing else. The absence of a dep on `@flighthq/textshaper-canvas` (the default backend) is correct — the seam must not pull its backend, which is installed via `setTextShaperBackend`. No surprising edges. | None |

Beyond `packages:check`: judgment confirms the _shape_ of the single edge is right, not just that the manifest is internally consistent. A seam package that defined `TextShaperBackend` inline, or reached for its own backend package, or imported the SDK barrel would all pass a naive "deps minimal" glance but violate layering — none occur here. All three imported symbols resolve to `@flighthq/types`, and the import is split correctly onto a dedicated `import type { }` line.

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is used (type imports in `textShaper.ts`); `typescript` is the build toolchain.
- **Phantom (used-but-undeclared) deps:** none. The only cross-package imports in `src/` (`TextShaperBackend`, `TextFormat`) come from the declared `@flighthq/types`.
- **Pinning:** workspace dep `@flighthq/types` pinned `*` per convention; `typescript` `^5.3.0` (devDep, conventional).
