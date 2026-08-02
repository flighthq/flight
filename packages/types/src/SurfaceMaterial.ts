import type { BlendMode } from './BlendMode';
import type { Material } from './Material';

// How a material resolves coverage. Mirrors glTF: 'opaque' ignores baseColor alpha, 'mask'
// hard-cuts at `alphaCutoff` (no blending), 'blend' alpha-blends. Distinct from BlendMode, the blend
// equation applied to the result.
export type MaterialAlphaMode = 'blend' | 'mask' | 'opaque';

// Shared trailer for every 3D surface material (the fields the §2 taxonomy lists in common).
// Concrete materials extend this and add their own maps/scalars. `alphaCutoff` applies only
// when `alphaMode` is 'mask'. `doubleSided` disables back-face culling. `blendMode` reuses the
// 2D blend enum so additive/multiply are expressible.
//
// A material does NOT declare how its output encodes alpha. Every blend equation in the renderers'
// tables is premultiplied and every built-in fragment tail emits premultiplied color, so there is one
// contract and nothing to choose. A caller-authored CustomShaderMaterial must therefore emit
// premultiplied color itself — Flight compiles that source verbatim and cannot append the fixup.
export interface SurfaceMaterial extends Material {
  alphaCutoff: number;
  alphaMode: MaterialAlphaMode;
  blendMode: BlendMode;
  doubleSided: boolean;
}
