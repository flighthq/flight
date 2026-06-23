# Dependency Alignment: @flighthq/surface-rs

**Verdict:** Clean. Dependencies are minimal, correct, and fully predictable from the package's role as a wasm-backed drop-in for `@flighthq/surface`; `npm run packages:check` passes and judgment adds no findings.

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| None | — | No `@flighthq/sdk` import; no inline cross-package types; no phantom or unused declared deps; no boundary violations; type-only deps imported with `import type`; `"sideEffects": false`. | — |

Notes that explain why the edges are correct (not findings):

- **`@flighthq/types` (value + type)** — type-only imports use `import type {…}` on their own lines (lines 2-29). The one value import is `BlendMode` (line 30), a runtime enum the package passes as an argument across the wasm boundary. Correct: cross-package types are consumed from the header, never redefined. The local `SURFACE_BEVEL_TYPE` / `PIXEL_ORDER` / `RESIZE_MODE` / `THRESHOLD_OPERATION` maps (lines 857-876) are not redefined types — they are surface-rs-local marshalling tables mapping the upstream string unions to Rust `repr(u8)` discriminants, which legitimately belong here.
- **`@flighthq/surface` (value + type)** — `index.ts` re-exports the whole API via `export * from '@flighthq/surface'` and shadows the bulk ops with wasm versions; `surfaceWasm.ts` imports the options types (`SurfaceBevelOptions` etc.) as `import type`. This is the entire reason the package exists; the edge is maximally predictable.
- **`@flighthq/resources` (value)** — used only for `invalidateImageResource` (1 import, 20 call sites). This exactly mirrors upstream `@flighthq/surface`, which imports the same function from `@flighthq/resources`. A faithful drop-in must reproduce the version-invalidation side effect, so the edge is required, not surprising.
- **`@flighthq/entity` correctly absent** — upstream `surface` declares `@flighthq/entity`, but surface-rs does not re-implement the entity-backed helpers (it re-exports them unchanged via `export *`), so it has no direct use and correctly omits the dep. Confirmed: no `@flighthq/entity` reference anywhere in `src/`.
- **Layering** — depends only on the header (`types`), the package it shadows (`surface`), and a leaf utility (`resources`). No backend-to-backend edge, no reaching up a layer. As a value-typed leaf "mixing" crate (per rust/index.md), this is the expected shape.

## Declared vs used

- **Declared:** `@flighthq/resources`, `@flighthq/surface`, `@flighthq/types` (all `"*"`, correctly pinned); dev: `typescript`.
- **Used in `src/`:** `@flighthq/resources` (`invalidateImageResource`), `@flighthq/surface` (re-export + options types), `@flighthq/types` (`BlendMode` + many type-only). Tests additionally import `@flighthq/surface` and `@flighthq/types` — both already declared.
- **Unused declared:** none.
- **Phantom (used-but-undeclared):** none. The `./wasm/surface_wasm.js` glue and `./wasm/surfaceWasmBytes` are local generated artifacts, not external deps.
