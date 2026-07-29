import type { Scene3DMaterialTextureRegistry, TransmissionVolumePbrExtension } from '@flighthq/types/contract';
import { TransmissionVolumePbrExtensionKind } from '@flighthq/types/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry';

export function registerTransmissionVolumePbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, TransmissionVolumePbrExtensionKind, (extension, out): void => {
    const transmission = extension as Readonly<TransmissionVolumePbrExtension>;
    if (transmission.transmissionMap !== null) out.push(transmission.transmissionMap);
    if (transmission.thicknessMap !== null) out.push(transmission.thicknessMap);
  });
}
