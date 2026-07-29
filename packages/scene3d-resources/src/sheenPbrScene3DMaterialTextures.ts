import type { Scene3DMaterialTextureRegistry, SheenPbrExtension } from '@flighthq/types/contract';
import { SheenPbrExtensionKind } from '@flighthq/types/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry';

export function registerSheenPbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, SheenPbrExtensionKind, (extension, out): void => {
    const sheen = extension as Readonly<SheenPbrExtension>;
    if (sheen.sheenColorMap !== null) out.push(sheen.sheenColorMap);
    if (sheen.sheenRoughnessMap !== null) out.push(sheen.sheenRoughnessMap);
  });
}
