import type { GltfDocument } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfCamerasCoreFeatureHandler } from './gltfCameras';
import { parseGltfWithCoreFeatureHandlers } from './gltfParse';

describe('GltfCamerasCoreFeatureHandler', () => {
  it('imports placed cameras when explicitly selected', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      cameras: [{ name: 'view', perspective: { yfov: 1, znear: 0.1 }, type: 'perspective' }],
      nodes: [{ camera: 0, translation: [1, 2, 3] }],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };

    const document = parseGltfWithCoreFeatureHandlers(source, [GltfCamerasCoreFeatureHandler]);

    expect(GltfCamerasCoreFeatureHandler.kind).toBe('cameras');
    expect(document.cameras).toHaveLength(1);
    expect(document.cameras[0]).toMatchObject({ name: 'view', near: 0.1, node: 0 });
    expect(document.cameras[0].transform.position).toMatchObject({ x: 1, y: 2, z: 3 });
  });
});
