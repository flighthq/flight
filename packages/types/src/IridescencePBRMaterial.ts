import type { StandardPbrMaterialProperties } from './StandardPBRMaterial';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// KHR_materials_iridescence: thin-film interference producing view-dependent rainbow shifts
// (soap bubble, oil slick). Composes the `standard` base block (D4). `iridescence` is the
// effect strength [0,1] (with `iridescenceMap`); `iridescenceIor` is the thin-film index of
// refraction; `iridescenceThicknessMin`/`iridescenceThicknessMax` bound the film thickness in
// nanometers, interpolated by `iridescenceThicknessMap`.
export interface IridescencePbrMaterial extends SurfaceMaterial {
  iridescence: number;
  iridescenceIor: number;
  iridescenceMap: Texture | null;
  iridescenceThicknessMap: Texture | null;
  iridescenceThicknessMax: number;
  iridescenceThicknessMin: number;
  standard: StandardPbrMaterialProperties;
}

export const IridescencePbrMaterialKind: unique symbol = Symbol('IridescencePbrMaterial');
