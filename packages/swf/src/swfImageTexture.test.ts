import type { Texture2D } from '@flighthq/types/contract';

import { acquireSwfImageTexture } from './swfImageTexture.ts';

describe('acquireSwfImageTexture', () => {
  it('returns the same texture for a second request with the same sampling', () => {
    // One character decodes once however many times the document draws it, so every sampling of it has
    // to resolve to one Texture identity — that identity is what the payload is later paired with.
    const owner = { imageTextures: new Map<number, Map<string, Texture2D>>() };
    const first = acquireSwfImageTexture(owner, 7, false, true);
    expect(acquireSwfImageTexture(owner, 7, false, true)).toBe(first);
  });

  it('returns a distinct texture per sampling of one character', () => {
    // Repeat and smoothing are sampler state, not pixel state: one payload can be drawn tiled here and
    // clamped there, and the two need different Textures over the same bytes.
    const owner = { imageTextures: new Map<number, Map<string, Texture2D>>() };
    const clamped = acquireSwfImageTexture(owner, 7, false, true);
    const repeated = acquireSwfImageTexture(owner, 7, true, true);
    const sharp = acquireSwfImageTexture(owner, 7, false, false);
    expect(repeated).not.toBe(clamped);
    expect(sharp).not.toBe(clamped);
    expect(owner.imageTextures.get(7)!.size).toBe(3);
  });

  it('keeps characters apart', () => {
    const owner = { imageTextures: new Map<number, Map<string, Texture2D>>() };
    expect(acquireSwfImageTexture(owner, 1, false, true)).not.toBe(acquireSwfImageTexture(owner, 2, false, true));
  });

  it('builds the sampler the requested sampling describes', () => {
    const owner = { imageTextures: new Map<number, Map<string, Texture2D>>() };
    const smoothRepeat = acquireSwfImageTexture(owner, 1, true, true).sampler!;
    expect(smoothRepeat.magFilter).toBe('linear');
    expect(smoothRepeat.mipmaps).toBe(true);
    expect(smoothRepeat.wrapU).toBe('repeat');

    const sharpClamp = acquireSwfImageTexture(owner, 1, false, false).sampler!;
    expect(sharpClamp.magFilter).toBe('nearest');
    expect(sharpClamp.mipmaps).toBe(false);
    expect(sharpClamp.wrapU).toBe('clamp-to-edge');
  });

  // The Texture exists before any pixels do, so a document that never loads its images still places and
  // sizes every bitmap it declares.
  it('allocates a texture with no source yet', () => {
    const owner = { imageTextures: new Map<number, Map<string, Texture2D>>() };
    expect(acquireSwfImageTexture(owner, 1, false, true)).not.toBeNull();
  });
});
