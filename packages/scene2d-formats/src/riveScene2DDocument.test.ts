import { getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import type { ImportDiagnostic, Node2D, Sprite, Texture2D } from '@flighthq/types/contract';
import {
  EntityRuntimeKey,
  ImportDiagnosticSeverity,
  ResourceResolutionState,
  SpriteKind,
} from '@flighthq/types/contract';

import {
  createRiveImageSprite,
  createScene2DDocumentFromRiveDocument,
  initializeRiveScene2DDocumentResult,
  markRiveNestedArtboard,
} from './riveScene2DDocument';

// The document layer acquires nothing. An embedded payload becomes a resource reference carrying the
// textures that wait on it, so resolving one binds the decoded image into every sprite at once —
// which is why an asset placed many times decodes once.

const ARTBOARD = 1;
const NESTED_ARTBOARD = 92;
const IMAGE = 100;
const IMAGE_ASSET = 105;
const FILE_ASSET_CONTENTS = 106;

const NAME = 4;
const WIDTH = 7;
const HEIGHT = 8;
const PARENT_ID = 5;
const ASSET_NAME = 203;
const ASSET_BYTES = 212;
const IMAGE_ASSET_ID = 206;
const NESTED_ARTBOARD_ID = 197;

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00];

describe('createRiveImageSprite', () => {
  it('stands up a sprite whose texture has no source until a resource resolves', () => {
    const sprite = createRiveImageSprite('logo', 0) as Sprite;

    expect(sprite.name).toBe('logo');
    // The texture exists but carries no pixels until a resource reference resolves into it.
    const texture = sprite.data.texture as Texture2D;
    expect(texture.dimension).toBe('2d');
    expect(texture.source).toBeNull();
  });
});

describe('createScene2DDocumentFromRiveDocument', () => {
  it('returns null for bytes that are not a Rive file', () => {
    expect(createScene2DDocumentFromRiveDocument(new Uint8Array([1, 2, 3, 4]))).toBeNull();
  });

  it('roots every artboard under one container rather than picking one', () => {
    const result = createScene2DDocumentFromRiveDocument(buildRive([artboard('First'), artboard('Second')]))!;

    expect(getNodeChildCount(result.root)).toBe(2);
    expect((getNodeChildAt(result.root, 0) as Node2D).name).toBe('First');
    expect((getNodeChildAt(result.root, 1) as Node2D).name).toBe('Second');
  });

  it('turns an embedded image asset into an unresolved reference with its detected type', () => {
    const result = createScene2DDocumentFromRiveDocument(
      buildRive([
        object(IMAGE_ASSET, [text(ASSET_NAME, 'sky')]),
        object(FILE_ASSET_CONTENTS, [bytes(ASSET_BYTES, PNG)]),
        artboard('Board'),
      ]),
    )!;

    expect(result.imageResources).toHaveLength(1);
    expect(result.imageResources[0].mimeType).toBe('image/png');
    expect(result.imageResources[0].state).toBe(ResourceResolutionState.Unresolved);
  });

  it('detects webp, which Rive ships more of than png', () => {
    const result = createScene2DDocumentFromRiveDocument(
      buildRive([object(IMAGE_ASSET, []), object(FILE_ASSET_CONTENTS, [bytes(ASSET_BYTES, WEBP)]), artboard('Board')]),
    )!;

    expect(result.imageResources[0].mimeType).toBe('image/webp');
  });

  it('reports an embedded image whose mime type cannot be detected', () => {
    const diagnostics: ImportDiagnostic[] = [];
    const result = createScene2DDocumentFromRiveDocument(
      buildRive([
        object(IMAGE_ASSET, []),
        object(FILE_ASSET_CONTENTS, [bytes(ASSET_BYTES, [1, 2, 3, 4])]),
        artboard('Board'),
      ]),
      diagnostics,
    )!;

    expect(result.imageResources[0].mimeType).toBeNull();
    expect(diagnostics).toEqual([
      {
        detail: { assetIndex: 0 },
        kind: 'rive.image-mime-type-undetected',
        origin: 'toRiveMimeType',
        severity: ImportDiagnosticSeverity.Drop,
      },
    ]);
  });

  it('stays silent for an embedded image whose mime type is detected', () => {
    const diagnostics: ImportDiagnostic[] = [];
    createScene2DDocumentFromRiveDocument(
      buildRive([object(IMAGE_ASSET, []), object(FILE_ASSET_CONTENTS, [bytes(ASSET_BYTES, PNG)]), artboard('Board')]),
      diagnostics,
    );

    expect(diagnostics).toEqual([]);
  });

  it('lists every texture waiting on an asset, so one decode binds them all', () => {
    const result = createScene2DDocumentFromRiveDocument(
      buildRive([
        object(IMAGE_ASSET, []),
        object(FILE_ASSET_CONTENTS, [bytes(ASSET_BYTES, PNG)]),
        artboard('Board'),
        object(IMAGE, [uint(PARENT_ID, 0), uint(IMAGE_ASSET_ID, 0)]),
        object(IMAGE, [uint(PARENT_ID, 0), uint(IMAGE_ASSET_ID, 0)]),
      ]),
    )!;

    const textures = result.imageResources[0].textures ?? [];
    expect(textures).toHaveLength(2);
    // The sprites are in the tree and their textures are the ones the reference lists.
    const board = getNodeChildAt(result.root, 0) as Node2D;
    const first = getNodeChildAt(board, 0) as Sprite;
    const second = getNodeChildAt(board, 1) as Sprite;
    expect(first.kind).toBe(SpriteKind);
    expect(textures[0]).toBe(first.data.texture);
    expect(textures[1]).toBe(second.data.texture);
  });

  it('leaves an asset with no bytes out of the resource list', () => {
    const result = createScene2DDocumentFromRiveDocument(
      buildRive([object(IMAGE_ASSET, [text(ASSET_NAME, 'external')]), artboard('Board')]),
    )!;

    expect(result.imageResources).toEqual([]);
  });

  it('makes a slot of a nested artboard, named for the artboard it references', () => {
    const result = createScene2DDocumentFromRiveDocument(
      buildRive([
        artboard('Host'),
        object(NESTED_ARTBOARD, [uint(PARENT_ID, 0), uint(NESTED_ARTBOARD_ID, 1)]),
        artboard('Button'),
      ]),
    )!;

    expect(result.slots).toHaveLength(1);
    expect(result.slots[0].linkage).toBe('Button');
    // A slot is a place the document does not fill itself.
    expect(result.slots[0].content).toBeNull();
    expect(result.slots[0].target).toBe(getNodeChildAt(getNodeChildAt(result.root, 0) as Node2D, 0));
    expect(Object.hasOwn(result.slots[0], EntityRuntimeKey)).toBe(true);
    expect(result.slots[0][EntityRuntimeKey]).toBeUndefined();
  });

  it('prefers the site name over the referenced artboard name when the file states one', () => {
    const result = createScene2DDocumentFromRiveDocument(
      buildRive([
        artboard('Host'),
        object(NESTED_ARTBOARD, [uint(PARENT_ID, 0), uint(NESTED_ARTBOARD_ID, 1), text(NAME, 'slotA')]),
        artboard('Button'),
      ]),
    )!;

    expect(result.slots[0].name).toBe('slotA');
    expect(result.slots[0].linkage).toBe('Button');
  });

  it('carries the import alongside, since clips and state machines are not document data', () => {
    const result = createScene2DDocumentFromRiveDocument(buildRive([artboard('Board')]))!;

    expect(result.imported.artboards).toHaveLength(1);
    expect(result.imported.artboards[0].name).toBe('Board');
  });
});

describe('initializeRiveScene2DDocumentResult', () => {
  it('is the construction initializer of createRiveScene2DDocumentResult', () => {
    expect(typeof initializeRiveScene2DDocumentResult).toBe('function');
  });
});

interface TestProperty {
  key: number;
  raw: number[];
}

function encodeVarUint(value: number): number[] {
  const out: number[] = [];
  let remaining = value;
  do {
    const group = remaining % 128;
    remaining = Math.floor(remaining / 128);
    out.push(remaining > 0 ? group + 128 : group);
  } while (remaining > 0);
  return out;
}

function float(key: number, value: number): TestProperty {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  return { key, raw: [view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3)] };
}

function uint(key: number, value: number): TestProperty {
  return { key, raw: encodeVarUint(value) };
}

function text(key: number, value: string): TestProperty {
  const encoded = Array.from(new TextEncoder().encode(value));
  return { key, raw: [...encodeVarUint(encoded.length), ...encoded] };
}

function bytes(key: number, value: readonly number[]): TestProperty {
  return { key, raw: [...encodeVarUint(value.length), ...value] };
}

function object(typeKey: number, properties: TestProperty[]): { properties: TestProperty[]; typeKey: number } {
  return { properties, typeKey };
}

function artboard(name: string) {
  return object(ARTBOARD, [text(NAME, name), float(WIDTH, 100), float(HEIGHT, 100)]);
}

function buildRive(objects: Array<{ properties: TestProperty[]; typeKey: number }>): Uint8Array {
  const out: number[] = [0x52, 0x49, 0x56, 0x45, ...encodeVarUint(7), ...encodeVarUint(0), ...encodeVarUint(0), 0];
  for (const entry of objects) {
    out.push(...encodeVarUint(entry.typeKey));
    for (const property of entry.properties) out.push(...encodeVarUint(property.key), ...property.raw);
    out.push(0);
  }
  return new Uint8Array(out);
}
describe('markRiveNestedArtboard', () => {
  it('records a slot site without putting format knowledge on the node', () => {
    const result = createScene2DDocumentFromRiveDocument(buildRive([artboard('Board')]))!;
    const node = getNodeChildAt(result.root, 0) as Node2D;
    markRiveNestedArtboard(node, 0);

    // The mark is side data; the node itself gains no field.
    expect(Object.keys(node)).not.toContain('nestedArtboard');
  });
});
