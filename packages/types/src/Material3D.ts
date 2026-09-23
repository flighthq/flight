import type { BlendMode } from './BlendMode';
import type { Material, MaterialDimensionKey } from './Material';

// How a material resolves coverage. Mirrors glTF: 'opaque' ignores baseColor alpha, 'mask'
// hard-cuts at `alphaCutoff` (no blending), 'blend' alpha-blends. Distinct from BlendMode, the blend
// equation applied to the result.
export type MaterialAlphaMode = 'blend' | 'mask' | 'opaque';

// The 3D branch of the material hierarchy, parallel to Node3D on the node side, and the shared trailer
// for every 3D material (the fields the §2 taxonomy lists in common). Concrete materials extend this
// and add their own maps/scalars. `alphaCutoff` applies only when `alphaMode` is 'mask'.
// `doubleSided` disables back-face culling. `blendMode` reuses the 2D blend enum so additive/multiply
// are expressible.
//
// Named for its dimension rather than for the surface it shades: "surface" is render-target vocabulary
// elsewhere in graphics (SkSurface, VkSurface, an EGL surface) and Flight itself uses Surface/CanvasSurface
// for render targets, so the old shared-material name collided with a concept it has nothing to do with.
//
// A material does NOT declare how its output encodes alpha. Every blend equation in the renderers'
// tables is premultiplied and every built-in fragment tail emits premultiplied color, so there is one
// contract and nothing to choose. A caller-authored CustomShaderMaterial must therefore emit
// premultiplied color itself — Flight compiles that source verbatim and cannot append the fixup.
export interface Material3D extends Material {
  // Phantom only — see MaterialDimensionKey. Never present at runtime. The trailer fields below
  // already block a Material2D from assigning here; this blocks the other direction.
  readonly [MaterialDimensionKey]?: '3d';
  alphaCutoff: number;
  alphaMode: MaterialAlphaMode;
  blendMode: BlendMode;
  doubleSided: boolean;
}
