import type { GltfDocument } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { parseGltfWithCoreFeatureHandlers } from './gltfParse';
import { GltfSkinsCoreFeatureHandler } from './gltfSkins';

describe('GltfSkinsCoreFeatureHandler', () => {
  it('imports skeleton topology when explicitly selected', () => {
    const source: GltfDocument = {
      asset: { version: '2.0' },
      nodes: [{ name: 'joint' }],
      scene: 0,
      scenes: [{ nodes: [0] }],
      skins: [{ joints: [0] }],
    };

    const document = parseGltfWithCoreFeatureHandlers(source, [GltfSkinsCoreFeatureHandler]);

    expect(GltfSkinsCoreFeatureHandler.kind).toBe('skins');
    expect(document.skins).toHaveLength(1);
    expect(document.skins[0].joints).toEqual([0]);
    expect(Array.from(document.skins[0].inverseBind[0].m)).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});
