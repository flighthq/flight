import type { StandardPbrMaterialProperties } from './StandardPbrMaterial';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// Flight subsurface-scattering extension (wrapped-diffuse approximation; flagged non-interop —
// no glTF equivalent). Composes the `standard` base block (D4). `subsurface` is the scattering
// strength [0,1] (with `subsurfaceMap`); `subsurfaceColor` is packed sRgb-albedo RGBA tinting
// the scattered light; `thickness` is the local-space material thickness (with `thicknessMap`)
// that governs how far light penetrates.
export interface SubsurfacePbrMaterial extends SurfaceMaterial {
  standard: StandardPbrMaterialProperties;
  subsurface: number;
  subsurfaceColor: number;
  subsurfaceMap: Texture | null;
  thickness: number;
  thicknessMap: Texture | null;
}

export const SubsurfacePbrMaterialKind = 'SubsurfacePbrMaterial';
