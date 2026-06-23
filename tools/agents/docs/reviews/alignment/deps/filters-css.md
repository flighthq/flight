# Dependency Alignment: @flighthq/filters-css

**Verdict:** Clean — the single declared dependency (`@flighthq/types`) is the only one used, imported type-only across all source, with no phantom, unused, cross-backend, or up-layer edges; `npm run packages:check` passes and judgment adds nothing to flag.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` | Declared `"*"`, used in every source file via `import type` only — carries no runtime weight, package stays `"sideEffects": false` and fully tree-shakable. | — |
| Info | (no `@flighthq/sdk` import) | Package does not import the barrel. Compliant. | — |
| Info | inbound `filters-canvas → filters-css` | `filters-canvas` consumes `computeBlurFilterCss`/`computeDropShadowFilterCss`/`computeOuterGlowFilterCss`. This is an _inbound_ edge and does not affect filters-css's own dependency set; noted only so the mapping is understood. The Canvas backend reusing the CSS filter-string builder (Canvas 2D accepts CSS filter strings) is a deliberate, sensible reuse, not a cross-backend coupling owned by filters-css. | — |

## Declared vs used

- **Unused declared deps:** none. `@flighthq/types` is used by all three source modules (`cssBlurFilter.ts`, `cssDropShadowFilter.ts`, `cssOuterGlowFilter.ts`).
- **Phantom (used-but-undeclared) deps:** none. The only non-relative imports are from `@flighthq/types`, which is declared. All other imports are relative (`./cssBlurFilter`, etc.).
- **Pinning:** `@flighthq/types` is pinned `"*"` per workspace convention. Correct.
- **Cross-package types redefined inline:** none. `BlurFilter`, `DropShadowFilter`, `OuterGlowFilter`, `InnerShadowFilter`, and `BevelFilter` are all imported from `@flighthq/types` (each confirmed to exist there), not re-declared locally. The `{ dx, dy }` offset shape returned by `getShadowFilterOffset` is a local return-value shape, not a cross-package contract.

### Mapping read

The dependency set is exactly what the package's purpose predicts: a leaf that turns filter _descriptors_ (defined in the header layer) into CSS filter strings needs only the descriptor types and nothing else — no geometry, no render core, no backend. It reaches across no boundary and up no layer. This is a model leaf package for dependency hygiene.
