import type { RiveCoreObject } from '@flighthq/types/contract';
import { RiveFieldType } from '@flighthq/types/contract';

import { createRiveFileAssets } from './riveAssets';

// Assets are addressed by their POSITION in this list, not by the id they state — reading the
// corpus's 61 image references as positions resolves all of them, and as stated ids resolves none.
// Embedded bytes travel untouched, because decoding them is a resource-layer concern.

const IMAGE_ASSET = 105;
const FONT_ASSET = 141;
const AUDIO_ASSET = 406;
const FILE_ASSET_CONTENTS = 106;
const SHAPE = 3;

const NAME = 203;
const HEIGHT = 207;
const WIDTH = 208;
const BYTES = 212;
const CDN_BASE_URL = 362;

describe('createRiveFileAssets', () => {
  it('returns nothing for a file that declares no asset', () => {
    expect(createRiveFileAssets([object(SHAPE, {})])).toEqual([]);
  });

  it('keeps assets in the order the file declares them', () => {
    const assets = createRiveFileAssets([
      text(IMAGE_ASSET, NAME, 'first'),
      text(FONT_ASSET, NAME, 'second'),
      text(AUDIO_ASSET, NAME, 'third'),
    ]);

    expect(assets.map((asset) => asset.name)).toEqual(['first', 'second', 'third']);
  });

  it('names each asset kind so a caller can tell them apart', () => {
    const assets = createRiveFileAssets([object(IMAGE_ASSET, {}), object(FONT_ASSET, {}), object(AUDIO_ASSET, {})]);

    expect(assets.map((asset) => asset.kind)).toEqual(['ImageAsset', 'FontAsset', 'AudioAsset']);
  });

  it('reads the dimensions a drawable asset states', () => {
    const assets = createRiveFileAssets([object(IMAGE_ASSET, { [WIDTH]: 128, [HEIGHT]: 64 })]);

    expect(assets[0]).toMatchObject({ height: 64, width: 128 });
  });

  // The bytes are binary. Reading them as UTF-8 would corrupt them, which is why the container keeps
  // blob-typed properties whole rather than decoding them as text.
  it('carries embedded bytes untouched from the contents that follows the asset', () => {
    const payload = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]);
    const assets = createRiveFileAssets([object(IMAGE_ASSET, {}), bytes(FILE_ASSET_CONTENTS, BYTES, payload)]);

    expect(assets[0].bytes).toEqual(payload);
  });

  it('attaches contents to the asset it follows, not to the first one', () => {
    const first = new Uint8Array([1, 2]);
    const second = new Uint8Array([3, 4]);
    const assets = createRiveFileAssets([
      object(IMAGE_ASSET, {}),
      bytes(FILE_ASSET_CONTENTS, BYTES, first),
      object(FONT_ASSET, {}),
      bytes(FILE_ASSET_CONTENTS, BYTES, second),
    ]);

    expect(assets[0].bytes).toEqual(first);
    expect(assets[1].bytes).toEqual(second);
  });

  it('leaves bytes null for an asset the file does not embed', () => {
    const assets = createRiveFileAssets([text(IMAGE_ASSET, CDN_BASE_URL, 'https://example.test/')]);

    expect(assets[0].bytes).toBeNull();
    expect(assets[0].cdnBaseUrl).toBe('https://example.test/');
  });

  it('ignores contents that precede any asset', () => {
    expect(createRiveFileAssets([bytes(FILE_ASSET_CONTENTS, BYTES, new Uint8Array([1]))])).toEqual([]);
  });
});

function object(typeKey: number, properties: Readonly<Record<number, number>>): RiveCoreObject {
  return {
    properties: Object.entries(properties).map(([key, value]) => ({
      key: Number(key),
      type: RiveFieldType.Double,
      value,
    })),
    typeKey,
  };
}

function text(typeKey: number, key: number, value: string): RiveCoreObject {
  return { properties: [{ key, type: RiveFieldType.String, value }], typeKey };
}

function bytes(typeKey: number, key: number, value: Uint8Array): RiveCoreObject {
  return { properties: [{ key, type: RiveFieldType.String, value }], typeKey };
}
