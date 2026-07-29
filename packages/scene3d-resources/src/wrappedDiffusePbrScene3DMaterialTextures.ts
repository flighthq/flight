import type { Scene3DMaterialTextureRegistry, WrappedDiffusePbrExtension } from '@flighthq/types/contract';
import { WrappedDiffusePbrExtensionKind } from '@flighthq/types/contract';

import { registerScene3DPbrExtensionTextures } from './sceneMaterialTextureRegistry';

export function registerWrappedDiffusePbrScene3DMaterialTextures(registry: Scene3DMaterialTextureRegistry): void {
  registerScene3DPbrExtensionTextures(registry, WrappedDiffusePbrExtensionKind, (extension, out): void => {
    const wrappedDiffuse = extension as Readonly<WrappedDiffusePbrExtension>;
    if (wrappedDiffuse.wrappedDiffuseMap !== null) out.push(wrappedDiffuse.wrappedDiffuseMap);
    if (wrappedDiffuse.thicknessMap !== null) out.push(wrappedDiffuse.thicknessMap);
  });
}
