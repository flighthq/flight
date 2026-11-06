import type { HostNetCapability } from '@flighthq/net/contract';
import {
  registerGltfAnimationHandlers,
  registerGltfCameraHandlers,
  registerGltfSkinHandlers,
} from '@flighthq/scene3d-formats/contract';
import type { GltfCoreFeatureHandler } from '@flighthq/scene3d-formats/contract';
import type { Scene3DDocument } from '@flighthq/scene3d/contract';

import {
  loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers,
  loadScene3DDocumentFromGltfUrlWithCoreFeatureHandlers,
} from './gltfLoad.ts';
import type { GltfScene3DDocumentLoadOptions } from './types.ts';

export async function loadScene3DDocumentFromGlbUrl(
  hostNet: Readonly<HostNetCapability>,
  url: string,
  options?: Readonly<GltfScene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  return loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers(
    hostNet,
    url,
    options?.coreFeatureHandlers ?? getFullGltfCoreFeatureHandlers(),
    options,
  );
}

export async function loadScene3DDocumentFromGltfUrl(
  hostNet: Readonly<HostNetCapability>,
  url: string,
  options?: Readonly<GltfScene3DDocumentLoadOptions>,
): Promise<Scene3DDocument | null> {
  return loadScene3DDocumentFromGltfUrlWithCoreFeatureHandlers(
    hostNet,
    url,
    options?.coreFeatureHandlers ?? getFullGltfCoreFeatureHandlers(),
    options,
  );
}

function getFullGltfCoreFeatureHandlers(): GltfCoreFeatureHandler[] {
  const handlers: GltfCoreFeatureHandler[] = [];
  registerGltfAnimationHandlers(handlers);
  registerGltfCameraHandlers(handlers);
  registerGltfSkinHandlers(handlers);
  return handlers;
}
