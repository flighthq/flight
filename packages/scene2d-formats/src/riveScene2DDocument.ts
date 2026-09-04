import { allocateEntity, finishEntity } from '@flighthq/entity/contract';
import { createEmbeddedImageResourceReference } from '@flighthq/image/contract';
import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { addNodeChild, getNodeChildAt, getNodeChildCount } from '@flighthq/node/contract';
import { createDisplayObject, createSprite } from '@flighthq/scene2d/contract';
import { createTexture } from '@flighthq/texture/contract';
import type {
  DisplayObject,
  ImageResourceReference,
  ImportDiagnostic,
  Node2D,
  RiveArtboardImport,
  RiveDocumentImportResult,
  RiveScene2DDocumentResult,
  Scene2DSlotReference,
  Texture,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createScene2DFromRiveDocument } from './riveScene2D';

/** Builds the sprite an image drawable stands up, and records which asset it waits on. */
export function createRiveImageSprite(name: string, assetIndex: number): DisplayObject {
  const texture = createTexture({ dimension: '2d', source: null });
  const sprite = createSprite({ data: { texture }, name });
  _imageTextures.set(sprite, texture);
  _imageAssetIndices.set(sprite, assetIndex);
  return sprite;
}

/**
 * A nested artboard is a named place the document does not fill itself, which is what a slot is. The
 * artboard it names supplies the slot's identity, so a resolver can dispatch on the authored symbol
 * rather than matching a display name.
 */
function createRiveSlots(artboards: readonly Readonly<RiveArtboardImport>[]): Scene2DSlotReference[] {
  const slots: Scene2DSlotReference[] = [];
  for (const artboard of artboards) {
    collectRiveSlots(artboard.root, artboards, slots);
  }
  return slots;
}

function collectRiveSlots(
  node: Node2D,
  artboards: readonly Readonly<RiveArtboardImport>[],
  slots: Scene2DSlotReference[],
): void {
  const nested = _nestedArtboards.get(node);
  if (nested !== undefined) {
    const target = artboards[nested];
    slots.push(
      (() => {
        const out = allocateEntity<Scene2DSlotReference>();
        out.content = null;
        out.linkage = target === undefined ? null : target.name;
        out.name = node.name !== null && node.name !== '' ? node.name : (target?.name ?? '');
        out.required = false;
        out.target = node;
        return finishEntity(out);
      })(),
    );
  }
  for (let index = 0; index < getNodeChildCount(node); index++) {
    collectRiveSlots(getNodeChildAt(node, index) as Node2D, artboards, slots);
  }
}

function createRiveImageResources(
  imported: Readonly<RiveDocumentImportResult>,
  diagnostics: ImportDiagnostic[] | undefined,
): ImageResourceReference[] {
  const references: ImageResourceReference[] = [];
  for (let index = 0; index < imported.assets.length; index++) {
    const asset = imported.assets[index];
    if (asset.kind !== RIVE_IMAGE_ASSET_KIND || asset.bytes === null) continue;
    const reference = createEmbeddedImageResourceReference(
      asset.bytes,
      toRiveMimeType(asset.bytes, index, diagnostics),
    );
    reference.textures = collectRiveTexturesForAsset(imported, index);
    references.push(reference);
  }
  return references;
}

// Every sprite standing in for this asset, so one decode binds them all.
function collectRiveTexturesForAsset(imported: Readonly<RiveDocumentImportResult>, assetIndex: number): Texture[] {
  const textures: Texture[] = [];
  for (const artboard of imported.artboards) {
    const walk = (node: Node2D): void => {
      const texture = _imageTextures.get(node);
      if (texture !== undefined && _imageAssetIndices.get(node) === assetIndex) textures.push(texture);
      for (let index = 0; index < getNodeChildCount(node); index++) walk(getNodeChildAt(node, index) as Node2D);
    };
    walk(artboard.root);
  }
  return textures;
}

/**
 * Imports a `.riv` as a named-graph document.
 *
 * A Rive file holds several artboards and names none of them "the" one, so the document's root is a
 * container of them rather than an arbitrary pick, and each artboard keeps its authored name.
 *
 * Image assets become **resource references** rather than acquired pixels: an embedded payload is
 * handed to the reference untouched and the textures waiting on it are listed there, so resolving one
 * binds the decoded image into every sprite that uses it at once. Nothing here decodes or fetches —
 * that is `resolveScene2DResources`' job, and the seam is what keeps import free of I/O.
 */
export function createScene2DDocumentFromRiveDocument(
  source: Readonly<Uint8Array>,
  diagnostics?: ImportDiagnostic[],
): RiveScene2DDocumentResult | null {
  const imported = createScene2DFromRiveDocument(source, diagnostics);
  if (imported.artboards.length === 0) return null;

  const root = createDisplayObject({ name: 'Rive' });
  for (const artboard of imported.artboards) addNodeChild(root, artboard.root);

  const out = allocateEntity<RiveScene2DDocumentResult>();
  out.imageResources = createRiveImageResources(imported, diagnostics);
  out.imported = imported;
  out.root = root;
  out.slots = createRiveSlots(imported.artboards);
  return finishEntity(out);
}

/**
 * Records a nested-artboard site so the document layer can turn it into a slot. Kept out of the node
 * itself: the display tree carries no knowledge of the format that produced it.
 */
export function markRiveNestedArtboard(node: Node2D, artboardIndex: number): void {
  _nestedArtboards.set(node, artboardIndex);
}

// Detected from the payload rather than trusted from a name, since Rive states no mime type.
function toRiveMimeType(
  bytes: Readonly<Uint8Array>,
  assetIndex: number,
  diagnostics: ImportDiagnostic[] | undefined,
): string | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'image/webp';
  reportImportDiagnostic(
    diagnostics,
    ImportDiagnosticSeverity.Drop,
    'rive.image-mime-type-undetected',
    'toRiveMimeType',
    { assetIndex },
  );
  return null;
}

const RIVE_IMAGE_ASSET_KIND = 'ImageAsset';

// Side tables rather than node fields: a display object stays ignorant of the format it came from.
const _nestedArtboards = new WeakMap<Node2D, number>();
const _imageTextures = new WeakMap<Node2D, Texture>();
const _imageAssetIndices = new WeakMap<Node2D, number>();
