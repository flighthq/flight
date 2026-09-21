import type { Material3DOptions } from './Material3DOptions';
import type { StandardPbrMaterialProperties } from './StandardPbrMaterial';
import type { TransmissionVolumePbrExtension } from './TransmissionVolumePbrExtension';

// Construction options for the canonical clear-glass preset. The standard property block and
// transmission-volume contribution remain independently configurable without nesting a material
// Entity inside ExtendedPbrMaterial.
export interface GlassExtendedPbrMaterialOptions extends Material3DOptions {
  standard?: Readonly<Partial<StandardPbrMaterialProperties>>;
  transmissionVolume?: Readonly<Partial<TransmissionVolumePbrExtension>>;
}
