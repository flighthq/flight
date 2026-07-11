import type { TextureContainer } from '@flighthq/types';
import type { TextureContainerFormat } from '@flighthq/types';
import { describe, expect, it } from 'vitest';

import { selectTextureContainer } from './selectTextureContainer';

function container(format: TextureContainerFormat): TextureContainer {
  return {
    depth: 1,
    faces: 1,
    format,
    height: 4,
    layers: 1,
    levels: [{ byteLength: 8, byteOffset: 0, height: 4, width: 4 }],
    mipLevels: 1,
    supercompression: 'None',
    width: 4,
  };
}

describe('selectTextureContainer', () => {
  it('returns the first container whose format is supported', () => {
    const peers = [container('pvrtc4bppRgb'), container('etc1'), container('bc3')];
    const chosen = selectTextureContainer(peers, ['bc3', 'etc1']);
    expect(chosen).not.toBeNull();
    // etc1 comes before bc3 in the peer list, so it wins even though both are supported.
    expect(chosen!.format).toBe('etc1');
  });

  it('returns null when no peer format is supported', () => {
    const peers = [container('pvrtc4bppRgb'), container('etc1')];
    expect(selectTextureContainer(peers, ['bc3', 'astc4x4'])).toBeNull();
  });

  it('returns null for an empty container set', () => {
    expect(selectTextureContainer([], ['bc3'])).toBeNull();
  });
});
