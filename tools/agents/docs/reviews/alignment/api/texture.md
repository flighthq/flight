# API Alignment: @flighthq/texture

**Verdict:** Strong alignment overall — full type words, correct allocation/copy verbs, alias-safe out-params, `Readonly<>` discipline — with one real cross-package naming drift (the "texture has pixels" predicate exists under three different names) and one minor unbound-getter symmetry gap.

## Findings

| Severity | Symbol | Issue | Suggested fix |
| --- | --- | --- | --- |
| Medium | `isTextureReady` | One concept ("does this texture reference a pixel source?") has three names across the SDK: `isTextureReady` here (`texture.image !== null`), `hasTexturePixels` in `@flighthq/scene-gl`, and `hasWgpuMaterialTexture` in `@flighthq/scene-wgpu` (both `texture !== null && texture.image !== null && texture.image.source !== null`). The texture package owns `Texture`, so the canonical predicate should live here and the renderers should reuse it, not re-define it under divergent verbs. The `has*…Pixels` form also reads better than `is*Ready` for "has a pixel source." | Pick one canonical name (recommend `hasTexturePixels`) exported from this package, have `scene-gl`/`scene-wgpu` import it, and retire `isTextureReady` / `hasWgpuMaterialTexture`. If the two readiness depths (image-bound vs image-source-uploaded) are genuinely distinct, name them so the distinction is explicit (e.g. `isTextureBound` vs `hasTexturePixels`) rather than letting each package coin its own. |
| Low | `setTextureImage` (no `getTextureImage`) / `isTextureReady` only on the depth `image` | `setTextureImage` is the only accessor pair member present; there is no `getTextureImage`, and `isTextureReady` checks only `image`, not whether the bound image actually has pixels (`image.source`). Consumers reaching for "is this safe to sample?" get a weaker guarantee here than the renderer predicates give. | Optional: add `getTextureImage` for symmetry, or document that direct field access (`texture.image`) is the intended read path. Align the readiness depth with the renderer predicates (see above) so `isTextureReady` and `hasTexturePixels` cannot disagree. |

## Clean

- **Full, unabbreviated type words everywhere.** `cloneCubeTexture`, `createSampler`, `copyTexture`, `setTextureImage`, `equalsSampler`, `isTextureReady` — every name carries the complete type word (`Texture`, `CubeTexture`, `Sampler`); no abbreviations.
- **Allocation discipline by verb is exact.** `create*` / `clone*` allocate via `createEntity`; `copyTexture` / `copySampler` write into an existing `out` and allocate nothing; `equalsSampler` / `isTextureReady` are pure predicates. No hidden allocation in the copy/predicate paths.
- **Out-params are alias-safe.** `copyTexture` reads `colorSpace`, `image`, `uvRotation` into locals before any write and delegates the entity fields to `copySampler`/`copyVector2` (themselves alias-safe), so `out === source` is correct. `copySampler` writes each field independently with no read-after-write hazard. Both are documented as alias-safe and the implementations back the claim.
- **`Readonly<>` discipline.** Every read-only object parameter is `Readonly<…Like>` (`source`, `texture`, `a`/`b`); mutable targets are `out` / `texture` only where mutation is intended (`copy*`, `setTextureImage`). Matches the const-by-default rule.
- **Sentinels over throws.** `equalsSampler` returns `false` for null/undefined operands rather than throwing; `isTextureReady` returns a boolean; no expected-missing case throws. No internal-invariant validation.
- **`equals*` verb is SDK-consistent.** `equalsSampler` matches the established `equals*` family (`equalsMatrix`, `equalsRectangle`, `equalsColorTransform`, `equalsMaterial`, …) for value equality, including the shared `a`/`b` parameter shape.
- **`clone`/`copy`/`create` follow the geometry ownership model** and are symmetric across `Texture`, `CubeTexture`, and `Sampler` (each has `create*` + `clone*`; `Texture`/`Sampler` add `copy*`). Cube intentionally omits `copy*`, a defensible scope choice.
- **Cross-package types come from `@flighthq/types`.** `Texture`, `TextureLike`, `Sampler`, `SamplerLike`, `CubeTexture`, `CubeTextureLike`, `ImageResource` are all imported, none redefined inline. All type imports are on dedicated `import type {}` lines.
- **Exported functions alphabetized** within each file; barrel is a thin `export *` re-export of the three domain files.
