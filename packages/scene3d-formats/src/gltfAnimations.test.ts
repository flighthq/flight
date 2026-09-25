import type { GltfDocument } from '@flighthq/types/contract';
import { describe, expect, it } from 'vitest';

import { GltfAnimationsCoreFeatureHandler } from './gltfAnimations.ts';
import { parseGltfWithCoreFeatureHandlers } from './gltfParse.ts';

describe('GltfAnimationsCoreFeatureHandler', () => {
  it('imports an authored translation channel when explicitly selected', () => {
    const times = new Float32Array([0, 1]);
    const values = new Float32Array([0, 0, 0, 1, 2, 3]);
    const bytes = new Uint8Array(times.byteLength + values.byteLength);
    bytes.set(new Uint8Array(times.buffer), 0);
    bytes.set(new Uint8Array(values.buffer), times.byteLength);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const source: GltfDocument = {
      accessors: [
        { bufferView: 0, componentType: 5126, count: 2, type: 'SCALAR' },
        { bufferView: 1, componentType: 5126, count: 2, type: 'VEC3' },
      ],
      animations: [
        {
          channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }],
          name: 'move',
          samplers: [{ input: 0, output: 1 }],
        },
      ],
      asset: { version: '2.0' },
      buffers: [{ byteLength: bytes.byteLength, uri: `data:application/octet-stream;base64,${btoa(binary)}` }],
      bufferViews: [
        { buffer: 0, byteLength: times.byteLength, byteOffset: 0 },
        { buffer: 0, byteLength: values.byteLength, byteOffset: times.byteLength },
      ],
      nodes: [{}],
      scene: 0,
      scenes: [{ nodes: [0] }],
    };

    const document = parseGltfWithCoreFeatureHandlers(source, [GltfAnimationsCoreFeatureHandler]);

    expect(GltfAnimationsCoreFeatureHandler.kind).toBe('animations');
    expect(document.animations).toHaveLength(1);
    expect(document.animations[0]).toMatchObject({ duration: 1, name: 'move' });
    expect(document.animations[0].channels).toHaveLength(1);
  });
});
