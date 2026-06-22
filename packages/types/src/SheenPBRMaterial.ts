import type { StandardPbrMaterialProperties } from './StandardPBRMaterial';
import type { SurfaceMaterial } from './SurfaceMaterial';
import type { Texture } from './Texture';

// KHR_materials_sheen: a retroreflective sheen lobe for cloth/fabric. Composes the `standard`
// base block (D4). `sheenColor` is packed sRgb-albedo RGBA, `sheenColorMap` tints it,
// `sheenRoughness` controls the lobe width, and `sheenRoughnessMap` modulates it.
export interface SheenPbrMaterial extends SurfaceMaterial {
  sheenColor: number;
  sheenColorMap: Texture | null;
  sheenRoughness: number;
  sheenRoughnessMap: Texture | null;
  standard: StandardPbrMaterialProperties;
}

export const SheenPbrMaterialKind: unique symbol = Symbol('SheenPbrMaterial');
