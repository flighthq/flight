import type { IridescencePbrExtension, Scene3DMaterialTextureRegistry } from '@flighthq/types/contract';
import { IridescencePbrExtensionKind } from '@flighthq/types/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry';

export function registerIridescencePbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, IridescencePbrExtensionKind, (extension, out): void => {
    const iridescence = extension as Readonly<IridescencePbrExtension>;
    if (iridescence.iridescenceMap !== null) out.push(iridescence.iridescenceMap);
    if (iridescence.iridescenceThicknessMap !== null) out.push(iridescence.iridescenceThicknessMap);
  });
}
