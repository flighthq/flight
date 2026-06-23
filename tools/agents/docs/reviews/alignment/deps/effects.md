# Dependency Alignment: @flighthq/effects

**Verdict:** Clean — exemplary value-typed leaf; the single declared dependency (`@flighthq/types`, pinned `*`) is exactly what is used, imported type-only, with no phantom, unused, or boundary-crossing edges.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | `@flighthq/types` (dep) | Sole runtime dep; pinned `"*"`; imported only via `import type { … }` on its own lines across all 43 effect files. Correct per types-as-header convention. | None. |
| None | `@flighthq/sdk` | Not imported anywhere. | None. |
| None | inline cross-package types | No `export interface` / `export type` / inline `interface`/`type` in src; every effect descriptor (`BloomEffect`, `VignetteEffect`, etc.) is sourced from `@flighthq/types`. | None. |
| None | tree-shaking | `"sideEffects": false`; `index.ts` is a thin re-export barrel; all `@flighthq/types` imports are `import type` (zero runtime weight). | None. |
| None | layering | No render-core, renderer-backend, or peer-effects edges. The package is pure substrate-agnostic recipe math (`create*Effect`, `computeBloomBlurRadius`) over header types — the layer-floor position the codebase map prescribes for effect intents. | None. |
| None | dependency mapping legibility | A reader predicting "effect intents + substrate-agnostic recipe math" expects exactly one edge to the header layer. The manifest matches that prediction. | None. |

`npm run packages:check` reports no effects-specific issues; nothing below contradicts or extends it beyond confirming the import/declaration cross-check by hand.

## Declared vs used

- **Declared runtime deps:** `@flighthq/types` (`*`).
- **Used runtime/type deps:** `@flighthq/types` only (type-only). All other imports are relative (`./…`).
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none.
- **Pinning:** workspace dep `@flighthq/types` correctly pinned `"*"`; `typescript` is the only devDependency (`^5.3.0`), expected.
