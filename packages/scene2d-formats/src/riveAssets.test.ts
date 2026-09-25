import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  ImportDiagnostic,
  RiveArtboardGraph,
  RiveArtboardImportContext,
  RiveCoreObject,
} from '@flighthq/types/contract';
import { RiveFieldType } from '@flighthq/types/contract';

import { getRiveNestedArtboardIndex } from './riveAssetBinding.ts';
import {
  createRiveFileAssets,
  importRiveImageComponent,
  importRiveNestedArtboardComponent,
  registerRiveAssetHandlers,
} from './riveAssets.ts';
import {
  createRiveArtboardImportContext,
  createRiveDocumentImportContext,
  createRiveImportRegistry,
  getRiveCoreObjectHandler,
} from './riveImportRegistry.ts';

// Assets are addressed by their POSITION in this list, not by the id they state — reading the
// corpus's 61 image references as positions resolves all of them, and as stated ids resolves none.
// Embedded bytes travel untouched, because decoding them is a resource-layer concern.

const ARTBOARD = 1;
const NESTED_ARTBOARD = 92;
const IMAGE = 100;
const FILE_ASSET = 103;
const NESTED_ARTBOARD_LAYOUT = 452;
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

  it('reports contents that precede any asset instead of discarding the payload silently', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const assets = createRiveFileAssets([bytes(FILE_ASSET_CONTENTS, BYTES, new Uint8Array([1, 2, 3]))], diagnostics);

    // Refusing to attach them anywhere is right — there is no asset to own them. Losing a whole
    // embedded image or font without a word is not, since the asset list still reads as complete.
    expect(assets).toEqual([]);
    expect(diagnostics).toMatchObject([
      { detail: { bytes: 3 }, kind: 'rive.asset-contents-unowned', severity: 'Drop' },
    ]);
  });

  it('stays silent when contents follow the asset that owns them', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const assets = createRiveFileAssets(
      [object(IMAGE_ASSET, {}), bytes(FILE_ASSET_CONTENTS, BYTES, new Uint8Array([1, 2, 3]))],
      diagnostics,
    );

    // The bytes landing on the asset is what makes this silence non-vacuous.
    expect(assets[0].bytes).toEqual(new Uint8Array([1, 2, 3]));
    expect(diagnostics).toEqual([]);
  });
});

describe('importRiveImageComponent', () => {
  it('stands up a sprite named by the drawable, waiting on the asset position it states', () => {
    const image = object(IMAGE, { 206: 2 });
    image.properties.push({ key: 4, type: RiveFieldType.String, value: 'logo' });

    const node = importRiveImageComponent(contextOf([image]), 1);

    expect(node?.name).toBe('logo');
  });
});

describe('importRiveNestedArtboardComponent', () => {
  it('marks the site with the artboard it names, so the document layer can make a slot', () => {
    const nested = object(NESTED_ARTBOARD, { 197: 1 });

    const node = importRiveNestedArtboardComponent(contextOf([nested]), 1);

    expect(node).not.toBeNull();
    expect(getRiveNestedArtboardIndex(node!)).toBe(1);
  });
});

describe('registerRiveAssetHandlers', () => {
  it('reads the asset list as a document pass, because an asset is not a component', () => {
    const registry = createRiveImportRegistry();
    registerRiveAssetHandlers(registry);

    const asset = getRiveCoreObjectHandler(registry, FILE_ASSET);
    expect(asset?.applyDocument).toBeInstanceOf(Function);
    expect(asset?.importComponent).toBeUndefined();
  });

  it('claims the drawables that reference content declared elsewhere in the file', () => {
    const registry = createRiveImportRegistry();
    registerRiveAssetHandlers(registry);

    expect(getRiveCoreObjectHandler(registry, IMAGE)?.importComponent).toBe(importRiveImageComponent);
    // NestedArtboardLayout is a NestedArtboard, so the base registration marks both kinds.
    expect(getRiveCoreObjectHandler(registry, NESTED_ARTBOARD_LAYOUT)?.importComponent).toBe(
      importRiveNestedArtboardComponent,
    );
  });

  it('collects an image asset through the document pass it registers', () => {
    const registry = createRiveImportRegistry();
    registerRiveAssetHandlers(registry);
    const objects = [text(IMAGE_ASSET, 203, 'logo')];
    const context = createRiveDocumentImportContext(registry, objects);
    getRiveCoreObjectHandler(registry, FILE_ASSET)?.applyDocument?.(context);

    expect(context.assets.map((entry) => entry.name)).toEqual(['logo']);
  });
});

function contextOf(components: RiveCoreObject[]): RiveArtboardImportContext {
  const objects = [object(ARTBOARD, {}), ...components];
  const graph: RiveArtboardGraph = {
    objects,
    parentIndices: objects.map((_value, index) => (index === 0 ? -1 : 0)),
    streamEnd: objects.length,
    streamStart: 0,
  };
  return createRiveArtboardImportContext(createRiveImportRegistry(), graph, objects, createDisplayObject({}), []);
}

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
