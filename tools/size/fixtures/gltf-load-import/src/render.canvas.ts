import type { HostNetCapability } from '@flighthq/net';
import { loadScene3DDocumentFromGlbUrl } from '@flighthq/scene3d-resources';

export const loader = loadScene3DDocumentFromGlbUrl;
export const result = loadScene3DDocumentFromGlbUrl(null as unknown as HostNetCapability, '');
