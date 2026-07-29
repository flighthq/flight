import type { PbrExtension, PbrUvSet } from './PbrExtension';
import type { Texture } from './Texture';

// KHR_materials_iridescence: view-dependent thin-film interference over a thickness range in nm.
export interface IridescencePbrExtension extends PbrExtension {
  iridescence: number;
  iridescenceIor: number;
  iridescenceMap: Texture | null;
  iridescenceMapUvSet: PbrUvSet;
  iridescenceThicknessMap: Texture | null;
  iridescenceThicknessMapUvSet: PbrUvSet;
  iridescenceThicknessMax: number;
  iridescenceThicknessMin: number;
  readonly kind: 'IridescencePbrExtension';
}

export const IridescencePbrExtensionKind = 'IridescencePbrExtension';
