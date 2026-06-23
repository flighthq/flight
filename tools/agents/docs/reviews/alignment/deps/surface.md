# Dependency Alignment: @flighthq/surface

**Verdict:** Clean — no `@flighthq/sdk` import, no inline cross-package types, all three declared deps (`@flighthq/types`, `@flighthq/entity`, `@flighthq/resources`) are directly imported and correctly placed at runtime, all pinned `"*"`, `"sideEffects": false` holds, and the dependency mapping reads exactly as a value-typed leaf image package should; no findings beyond `packages:check` (which passes).

## Findings

| Severity | Dependency/edge | Issue | Fix |
| --- | --- | --- | --- |
| Info | `@flighthq/types` | Correct mixed runtime+type dependency. Imported in 38 places: type-only shapes (`Surface`, `ImageResource`, etc.) via `import type`, plus one legitimate value import — `BlendMode` (a TS `enum`, so a real runtime value) in `surfaceComposite.ts`, used as `BlendMode.Normal`, in `switch` cases, and via reverse lookup `BlendMode[blendMode]`. Header-layer dependency reads exactly as expected. | None. |
| Info | `@flighthq/resources` | Correctly a runtime dependency. Value imports only: `invalidateImageResource` (across 13 mutating ops — fill, copy, composite, flip, resize, rotate, noise, etc.) and `createImageResourceFromCanvas` (`surfaceFrom.ts`). Maps cleanly to surface's role (mutating/creating `ImageResource` pixel buffers). | None. |
| Info | `@flighthq/entity` | Correctly a runtime dependency: `createEntity` value import in `surface.ts` and `surfaceFrom.ts`. Declared directly even though `@flighthq/resources` also depends on `@flighthq/entity` — correct hygiene (depend on what you import directly, not transitively). | None. |
| Info | Inline `Surface*Options` types | `surfaceBlur.ts`, `surfaceBevel.ts`, `surfaceConvolution.ts`, `surfaceDisplacement.ts`, `surfaceGradient.ts`, `surfaceResize.ts`, `surfaceShadow.ts`, `surfaceSharpen.ts` each export a local option/parameter interface (`SurfaceBevelOptions`, `SurfaceDropShadowOptions`, etc.). These are arguments to this package's own functions, consumed by no other package — not cross-package types — so they correctly stay package-local. The boundary-crossing entity (`Surface extends ImageResource`) lives in `@flighthq/types`. | None. |
| Info | Layering | No surprising edges. Surface is a leaf: it depends only on the header (`types`) plus two foundational data packages (`entity`, `resources`). No renderer, no render core, no sibling reach, no "up the stack" edge. Matches the rust map's characterization of `surface` as a mixable value-in/value-out leaf. | None. |

## Declared vs used

**Declared dependencies:** `@flighthq/types`, `@flighthq/entity`, `@flighthq/resources` (all pinned `"*"` ✓). devDependencies: `typescript`.

- **Unused declared:** none. All three declared deps are imported in shipped (non-test) source.
- **Phantom (used-but-undeclared):** none. The only `@flighthq/*` imports across all src are `types`, `entity`, `resources` — all three declared. No non-flighthq runtime imports.
- **Correctly placed runtime deps:** `@flighthq/entity` (value: `createEntity`), `@flighthq/resources` (values: `invalidateImageResource`, `createImageResourceFromCanvas`), `@flighthq/types` (mostly `import type`, plus the `BlendMode` enum as a genuine runtime value).
- **No `@flighthq/sdk` import.** ✓
- **`"sideEffects": false`** present; no top-level side effects (confirmed by `packages:check`). Tree-shakable. ✓
