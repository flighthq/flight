import type { AlphaType } from './AlphaType';
import type { BlendMode } from './BlendMode';
import type { Material } from './Material';

// How a material resolves coverage. Mirrors glTF: 'opaque' ignores baseColor alpha, 'mask'
// hard-cuts at `alphaCutoff` (no blending), 'blend' alpha-blends. Distinct from BlendMode (the
// blend equation) and from AlphaType (how a texture's pixels encode alpha).
export type MaterialAlphaMode = 'blend' | 'mask' | 'opaque';

// Shared trailer for every 3D surface material (the fields the §2 taxonomy lists in common).
// Concrete materials extend this and add their own maps/scalars. `alphaCutoff` applies only
// when `alphaMode` is 'mask'. `doubleSided` disables back-face culling. `blendMode` reuses the
// 2D blend enum so additive/multiply are expressible. `alphaType` declares whether this
// material's blended output is premultiplied or straight.
export interface SurfaceMaterial extends Material {
  alphaCutoff: number;
  alphaMode: MaterialAlphaMode;
  alphaType: AlphaType;
  blendMode: BlendMode;
  doubleSided: boolean;
}
