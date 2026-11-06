import type { IridescencePbrExtension } from '@flighthq/materials/contract';
import { IridescencePbrExtensionKind } from '@flighthq/materials/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry.ts';
import type { Scene3DMaterialTextureRegistry } from './types.ts';

export function registerIridescencePbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, IridescencePbrExtensionKind, (extension, out): void => {
    const iridescence = extension as Readonly<IridescencePbrExtension>;
    if (iridescence.iridescenceMap !== null) out.push(iridescence.iridescenceMap);
    if (iridescence.iridescenceThicknessMap !== null) out.push(iridescence.iridescenceThicknessMap);
  });
}
