import { packLinearToColor } from '@flighthq/color/contract';
import { createTransmissionVolumePbrExtension } from '@flighthq/materials/contract';
import type {
  GltfExtensionContext,
  GltfExtensionHandler,
  TransmissionVolumePbrExtension,
} from '@flighthq/types/contract';
import { TransmissionVolumePbrExtensionKind } from '@flighthq/types/contract';

import { attachGltfPbrExtension, findGltfPbrExtension } from './gltfMaterialExtension';

// The three glTF extensions that share ONE Flight descriptor: refraction through a finite absorbing
// volume is a single shading concept, so `TransmissionVolumePbrExtension` carries transmission, volume,
// and ior together. They stay three separately importable handlers because a file may state any subset —
// transmission alone is a thin refractive surface, and ior alone retunes the dielectric response of an
// otherwise ordinary material — and because accepting one extension must never install the others.
//
// Whichever runs first attaches the descriptor; the rest find it and fill their own fields. Handler order
// is not guaranteed, so none of them may assume it is the one that created it.
export const GltfTransmissionExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_transmission;
      if (block === undefined) continue;
      const target = resolveTransmissionVolume(context, i);
      if (target === null) continue;
      target.transmission = block.transmissionFactor ?? 0;
      // The factor rides the RED channel — linear data, never gamma-decoded.
      target.transmissionMap = context.resolveTexture(block.transmissionTexture, 'linear');
    }
  },
  kind: 'KHR_materials_transmission',
};

export const GltfVolumeExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_volume;
      if (block === undefined) continue;
      const target = resolveTransmissionVolume(context, i);
      if (target === null) continue;
      const attenuation = block.attenuationColor ?? [1, 1, 1];
      target.attenuationColor = packLinearToColor([attenuation[0] ?? 1, attenuation[1] ?? 1, attenuation[2] ?? 1, 1]);
      // Spec default is +Infinity: a volume that never absorbs, however deep the ray travels.
      target.attenuationDistance = block.attenuationDistance ?? Number.POSITIVE_INFINITY;
      target.thickness = block.thicknessFactor ?? 0;
      // Thickness rides the GREEN channel — linear data.
      target.thicknessMap = context.resolveTexture(block.thicknessTexture, 'linear');
    }
  },
  kind: 'KHR_materials_volume',
};

export const GltfIorExtensionHandler: GltfExtensionHandler = {
  apply(context) {
    const materials = context.source.materials ?? [];
    for (let i = 0; i < materials.length; i++) {
      const block = materials[i].extensions?.KHR_materials_ior;
      if (block === undefined) continue;
      const target = resolveTransmissionVolume(context, i);
      if (target === null) continue;
      target.ior = block.ior ?? GLTF_DEFAULT_IOR;
    }
  },
  kind: 'KHR_materials_ior',
};

// Finds the shared descriptor on the material at `index`, attaching a fresh one if no sibling handler has
// yet. Null when the material cannot carry extensions at all (see attachGltfPbrExtension).
function resolveTransmissionVolume(
  context: Readonly<GltfExtensionContext>,
  index: number,
): TransmissionVolumePbrExtension | null {
  const existing = findGltfPbrExtension(context.document, index, TransmissionVolumePbrExtensionKind);
  if (existing !== null) return existing as TransmissionVolumePbrExtension;
  const created = createTransmissionVolumePbrExtension();
  if (!attachGltfPbrExtension(context.document, index, created)) return null;
  return created;
}

// The glTF spec default index of refraction — common glass, and what a material stating no ior means.
const GLTF_DEFAULT_IOR = 1.5;
