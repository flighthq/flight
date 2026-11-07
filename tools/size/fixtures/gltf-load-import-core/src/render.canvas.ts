import type { HostNetCapability } from '@flighthq/net';
import { loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers } from '@flighthq/scene3d-resources';

export const loader = loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers;
export const result = loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers(
  null as unknown as HostNetCapability,
  '',
  [],
);
