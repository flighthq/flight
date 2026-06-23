# Dependency Alignment: @flighthq/types

**Verdict:** Clean — exemplary for a header layer: zero runtime deps, zero cross-package imports, one correctly-declared and genuinely-used ambient type dep; nothing for `packages:check` or judgment to flag beyond one cosmetic tsconfig `types` nit.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/sdk` | Not imported. `grep "from '@flighthq"` in `src/` returns nothing. | — |
| None | cross-package types | This package _is_ the header layer; it defines cross-package types rather than redefining them. No inline cross-package types to flag. | — |
| None | `dependencies` | Empty (`{}`). Correct — a pure header has no runtime edges, and `src/` has zero non-relative `from` imports (only relative barrel re-exports in `index.ts`). | — |
| None | `@webgpu/types` (devDep) | Genuinely used: `GPUDevice`, `GPUTexture`, `GPUBuffer`, `GPUTextureFormat`, etc. appear across ~dozen files (e.g. `GlRenderState.ts`, `Material.ts`, `CubeTexture.ts`). Wired as an ambient global via tsconfig `types`, so no explicit import is needed or expected. Pinned `"*"` matching the 3 other GPU packages (`render-wgpu`, `displayobject-wgpu`, `filters-wgpu`); root resolves `^0.1.70`. | — |
| None | `typescript` (devDep) | Used by `tsc -b` build/typecheck. Pinned `^5.3.0`, uniform across packages. | — |
| Info | tsconfig `types: [...]` | Lists `@testing-library/jest-dom` and `vitest/globals`, but the lone test (`missing.test.ts`) is a placeholder using bare `it` + `assert` and no jest-dom matchers/`expect`. The entries are inherited from `tsconfig.base.json` and harmless; they only matter once real tests land. Not a dependency defect — just unexercised ambient type surface. | Leave as-is (matches base config); revisit only if trimming per-package tsconfig. |
| Info | tree-shaking | `"sideEffects": false`; runtime value exports (75: `*Kind` strings, a few enums, `Symbol()` keys) have no external runtime imports, so they add no dependency weight and tree-shake per-symbol. Type-only surface carries nothing at runtime. | — |

## Declared vs used

- **Unused declared deps:** none. Both devDeps (`@webgpu/types`, `typescript`) are used.
- **Phantom (used-but-undeclared) deps:**
  - Runtime: none. No package-level runtime imports exist.
  - Tooling (judgment call, **not flagged as a defect**): `vitest` and `@testing-library/jest-dom` are referenced via tsconfig `types`/test config but not declared in this package's `devDependencies`. This is the **deliberate codebase convention** — 0 of 86 packages declare `vitest` locally; both are root-hoisted dev tooling. Consistent, so not a phantom-dep violation here.
- **Workspace dep pinning (`"*"`):** N/A — no `@flighthq/*` dependencies to pin. `@webgpu/types: "*"` follows the established convention for that ambient dep.
- **Layering:** Respected by definition. `@flighthq/types` is the bottom header layer and depends on no other package; it is the thing other packages depend "up" to. No surprising edges.
