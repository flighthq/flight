# Filename Alignment — Global

Survey of every `packages/*/src` source filename (excluding `*.test.ts` and barrel `index.ts`) against the filename convention: a bare filename, folder removed, must name the **domain** it covers or the **object** it operates over — never a single function — and backend-variant packages (`*-canvas`/`*-dom`/`*-gl`/`*-wgpu`/`*-css`/`*-surface`) must prefix **every** file with the backend token, prefix-first.

Headline: the backend-variant packages are in excellent shape — prefix-first is applied with near-total consistency across `displayobject-{canvas,dom,gl,wgpu}`, `effects-{canvas,gl,wgpu}`, `filters-{canvas,css,gl,wgpu,surface}`, `render-{gl,wgpu}`, `scene-{gl,wgpu}`, and `host-electron`. No suffix-style (`blurFilterGl.ts`) names exist anywhere. The real debt is concentrated in (1) a handful of generic names in single-implementation packages, and (2) the `internal.ts` dumping-ground pattern repeated across five packages.

## Generic names to fix

These carry no domain/object on their own; the bare filename fails the "remove the folder" test.

| File | Problem | Proposed |
| --- | --- | --- |
| `geometry/typedarray.ts` | Generic _and_ lowercased; holds `reserveFloat32Array`/`reserveInt16Array`/`reserveUint16Array` capacity-growth helpers. "typedarray" names a JS primitive family, not this domain. | `typedArrayCapacity.ts` (the object is the growable typed-array buffer; the domain is reserve/grow). |
| `math/random.ts` | "random" is a topic, not an object. Holds `createRandomSource` (mulberry32 PRNG) — the object is the seeded generator. | `randomSource.ts` (matches the `RandomSource` type it exports). |
| `math/nextPowerOfTwo.ts` | Named after a single function. | Fold into a `mathInteger.ts` / `powerOfTwo.ts` object file, or accept as the genuinely single-purpose unit it is — borderline, lower priority than the others. |
| `particles/curve.ts` | "curve" is generic; file builds/evaluates `ParticleCurve` LUTs (`buildParticleColorCurve`, etc.). In a package whose every other file is `particle*`-prefixed, this is the odd one out. | `particleCurve.ts` (matches the `ParticleCurve` type and the package's own naming rhythm). |
| `materials/color.ts` | "color" is maximally generic; holds linear-color packing/hex helpers (`LinearColor`, `computeRgbHexString`, `createLinearColor`). Color is also a cross-cutting convention concept, so a bare `color.ts` over-claims. | `linearColor.ts` (the object is the `LinearColor` float vector). |
| `materials/material.ts` | Borderline: `createMaterial`/`equalsMaterial` over the base `Material` entity — the object _is_ "material". Acceptable as the base-entity file, but note it sits beside `classicMaterials.ts`/`pbrMaterials.ts`/`unlitMaterials.ts` (plural family files), so a `baseMaterial.ts` would read more clearly as "the base". Low priority. |
| `signals/throttle.ts` | "throttle" is a verb/topic; holds `connectSignalAtRate` (rate-limited signal connection). | `signalRate.ts` or `signalThrottle.ts` (object: the throttled signal connection). |

Not flagged (verified, legitimately domain/object-named despite terse look): `node/revision.ts` (the `*WorldTransformRevision` invalidation-revision domain), `path/path.ts` (the `Path` object — package-disambiguated), `render/renderer.ts` (the `Renderer` object), `resources/font.ts` vs `fontResource.ts` (distinct objects: `Font` vs `FontResource`), `scene/mesh.ts` vs the `mesh` package (`Mesh` scene node vs `MeshGeometry` builders — different objects, package disambiguates). The whole `effects/` / `filters/` set (`bloomEffect.ts`, `blurFilter.ts`, …) is exemplary object-naming.

## Backend-prefix violations

The backend packages are clean prefix-first almost everywhere. The exceptions:

| File | Package | Problem | Fix |
| --- | --- | --- | --- |
| `displayobject-dom/htmlView.ts` | `displayobject-dom` | **Bare, un-prefixed in a backend package.** Every sibling is `dom*` (`domBitmap.ts`, `domShape.ts`, …); this one is not. It also collides by basename with `displayobject/htmlView.ts` (the cross-cutting display object), erasing the "which layer am I" signal the prefix exists to give. | `domHtmlView.ts`. |

Subject-agnostic GPU-core / test helpers (`render-gl/glTestHelper.ts`, `render-wgpu/wgpuTestHelper.ts`, `filters-gl/glTestHelper.ts`, `filters-wgpu/wgpuTestHelper.ts`, `render-gl/internal.ts`) **do** carry the backend prefix where it matters and are not violations — flagged only for the `internal.ts` / collision notes below. Likewise `displayobject-canvas/canvasElement.ts` and `render-gl/glElement.ts` / `render-wgpu/wgpuElement.ts` are correctly prefixed.

No suffix-style names (`blurFilterGl.ts`) and no bare backend-domain names (a bare `blurFilter.ts` inside `filters-gl`) were found anywhere. This convention is effectively fully enforced apart from the single `htmlView.ts` case.

## Collisions worth resolving

Legitimate domain reuse (each a real domain/object, package disambiguates) is fine and **not** flagged: e.g. nothing problematic among the object-named files. The collisions that erode the convention:

| Basename | Packages | Verdict |
| --- | --- | --- |
| `internal.ts` | `displayobject`, `render-gl`, `signals`, `text`, `tween` | **Dumping-ground pattern, repeated 5×.** Each is a different thing: `displayobject/internal.ts` = `DisplayObjectInternal` writable cast; `text/internal.ts` = `RichTextDataInternal` cast; `render-gl/internal.ts` = re-export of writable GL shader types; `signals/internal.ts` = the empty-signal `emit` no-op; `tween/internal.ts` = `initializeTween`. The CLAUDE.md map calls the `internal.ts` cast a **legacy approach — do not extend it; prefer runtime slots**. The bare name is self-describing of _visibility_, not _domain_. Rename each to its object: `displayObjectInternal.ts`, `richTextInternal.ts` (or fold into `richText.ts`), `glShaderInternal.ts`, `signalEmit.ts`, `tweenInit.ts`. At minimum stop adding new ones. |
| `htmlView.ts` | `displayobject`, `displayobject-dom` | See backend-prefix table — resolve by prefixing the DOM one to `domHtmlView.ts`. Once fixed, no collision remains (`displayobject/htmlView.ts` is the legitimate `HtmlView` display object). |
| `glTestHelper.ts` | `filters-gl`, `render-gl` | Both correctly backend-prefixed; both are genuine "GL test helper" objects for their package. Package disambiguates. **Acceptable** — leave as-is. |
| `wgpuTestHelper.ts` | `filters-wgpu`, `render-wgpu` | Same as above. **Acceptable.** |

## Clean patterns to keep

- **Backend prefix-first is the model to preserve.** `displayobject-{canvas,dom,gl,wgpu}`, `effects-{canvas,gl,wgpu}`, `filters-{canvas,css,gl,wgpu,surface}`, `render-{gl,wgpu}`, and `scene-{gl,wgpu}` all read like `<backend><Object>.ts` end to end (`canvasBitmap.ts`, `wgpuShape.ts`, `glBlurFilter.ts`, `cssDropShadowFilter.ts`, `surfaceBlurFilter.ts`). A reader knows backend _and_ object from the bare filename. Hold this line for every new backend file.
- **Object-named single-impl families.** `effects/` (`bloomEffect.ts` … `vignetteEffect.ts`), `filters/` (`blurFilter.ts` …), `lighting/` (`pointLight.ts`, `spotLight.ts`, …), `geometry/` (`vector2.ts`, `matrix4.ts`, `quaternion.ts` + paired `*Pool.ts`), `easing/` (`easeBack.ts` …), and the `*Pool.ts` paired-allocator convention are all clean: filename = the type it owns.
- **`types/` is the gold standard** — one PascalCase file per type (`BlurFilter.ts`, `DisplayObject.ts`, `RenderState.ts`), filename == exported type name, fully navigable as the header layer.
- **`surface/` `surface*`-prefixed operation files** (`surfaceBlur.ts`, `surfaceFingerprint.ts`, …) and **`scene-gl`/`scene-wgpu` per-material renderer files** (`phongGlMeshMaterialRenderer.ts`, `standardPbrWgpuMeshMaterialRenderer.ts`) name the exact object/material — verbose but self-identifying, exactly as the convention wants.
- **Format sub-packages** (`particles-formats/`, `spritesheet-formats/`) use `<vendor><Action>.ts` (`asepriteParse.ts`, `unitySchema.ts`, `texturePackerSerialize.ts`) — vendor-prefixed, no generic `parse.ts`/`schema.ts`. Keep this.
