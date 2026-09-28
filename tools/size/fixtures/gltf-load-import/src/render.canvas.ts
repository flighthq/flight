import { loadScene3DDocumentFromGlbUrl } from '@flighthq/scene3d-resources';
import type { HostNetCapability } from '@flighthq/types';

export const loader = loadScene3DDocumentFromGlbUrl;
export const result = loadScene3DDocumentFromGlbUrl(null as unknown as HostNetCapability, '');
