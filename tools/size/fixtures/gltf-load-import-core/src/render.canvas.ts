import { loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers } from '@flighthq/scene3d-resources';
import type { HostNetCapability } from '@flighthq/types';

export const loader = loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers;
export const result = loadScene3DDocumentFromGlbUrlWithCoreFeatureHandlers(
  null as unknown as HostNetCapability,
  '',
  [],
);
