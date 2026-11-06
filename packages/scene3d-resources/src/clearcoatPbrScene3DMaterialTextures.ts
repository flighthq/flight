import type { ClearcoatPbrExtension } from '@flighthq/materials/contract';
import { ClearcoatPbrExtensionKind } from '@flighthq/materials/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry.ts';
import type { Scene3DMaterialTextureRegistry } from './types.ts';

export function registerClearcoatPbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, ClearcoatPbrExtensionKind, (extension, out): void => {
    const clearcoat = extension as Readonly<ClearcoatPbrExtension>;
    if (clearcoat.clearcoatMap !== null) out.push(clearcoat.clearcoatMap);
    if (clearcoat.clearcoatNormalMap !== null) out.push(clearcoat.clearcoatNormalMap);
    if (clearcoat.clearcoatRoughnessMap !== null) out.push(clearcoat.clearcoatRoughnessMap);
  });
}
