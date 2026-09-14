import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import { createDisplayObject } from '@flighthq/scene2d/contract';
import type {
  DisplayObject,
  ImportDiagnostic,
  RiveArtboardImportContext,
  RiveCoreObject,
  RiveFileAsset,
  RiveImportRegistry,
} from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { createRiveImageSprite, markRiveNestedArtboard } from './riveAssetBinding';
import { getRiveCoreTypeName, isRiveCoreTypeDerivedFrom } from './riveCoreTypes';
import { importRiveCoreObjectAsData, registerRiveCoreObjectHandler } from './riveImportRegistry';

/**
 * Collects the file's assets in the order it declares them, which is also how they are addressed:
 * an image drawable's `assetId` is a position in this list, not the asset's own stated id. That was
 * settled against the corpus — reading it as a position resolves all 61 image references, and
 * reading it as the stated id resolves none.
 *
 * Bytes travel with the asset when the file embeds them and are handed over untouched. Turning them
 * into an image is a resource-layer concern, so this codec acquires nothing: a caller resolves what
 * it wants through the import options, exactly as the SVG and Lottie importers do.
 */
export function createRiveFileAssets(
  objects: readonly Readonly<RiveCoreObject>[],
  diagnostics?: ImportDiagnostic[],
): RiveFileAsset[] {
  const assets: RiveFileAsset[] = [];
  for (const object of objects) {
    if (isRiveCoreTypeDerivedFrom(object.typeKey, RIVE_FILE_ASSET)) {
      assets.push({
        bytes: null,
        cdnBaseUrl: readRiveText(object, RIVE_ASSET_CDN_BASE_URL, ''),
        height: readRiveNumber(object, RIVE_ASSET_HEIGHT, 0),
        kind: getRiveCoreTypeName(object.typeKey) ?? '',
        name: readRiveText(object, RIVE_ASSET_NAME, ''),
        width: readRiveNumber(object, RIVE_ASSET_WIDTH, 0),
      });
      continue;
    }
    if (object.typeKey !== RIVE_FILE_ASSET_CONTENTS) continue;
    // The contents object follows the asset it belongs to, carrying the embedded payload. With no
    // asset ahead of it there is nothing to attach to, and the embedded bytes — a whole image or font
    // the file carries inline — are discarded. The import still succeeds and the asset list still
    // looks complete, so the payload goes missing with nothing to count it.
    if (assets.length === 0) {
      reportImportDiagnostic(
        diagnostics,
        ImportDiagnosticSeverity.Drop,
        'rive.asset-contents-unowned',
        'createRiveFileAssets',
        { bytes: readRiveBytes(object, RIVE_ASSET_BYTES)?.length ?? 0 },
      );
      continue;
    }
    assets[assets.length - 1].bytes = readRiveBytes(object, RIVE_ASSET_BYTES);
  }
  return assets;
}

/**
 * An image drawable stands up a sprite that waits on the asset it names by position, so one decoded
 * payload can bind every sprite using it at once. Import acquires nothing: the pixels arrive later,
 * through the document layer's resource references.
 */
export function importRiveImageComponent(context: RiveArtboardImportContext, index: number): DisplayObject | null {
  const object = context.artboard.objects[index];
  return createRiveImageSprite(readRiveText(object, RIVE_NAME, ''), readRiveNumber(object, RIVE_IMAGE_ASSET_ID, -1));
}

/**
 * A nested artboard is a site the file does not fill itself, which is what a slot is: it imports as a
 * container marked with the artboard it names, and the document layer turns the mark into a slot.
 *
 * Both nested-artboard kinds carry the same semantics, which is why this is registered against the
 * base type rather than the leaf — an equality test would mark neither `NestedArtboardLeaf` nor
 * `NestedArtboardLayout` and both would arrive as drawables nobody reads.
 */
export function importRiveNestedArtboardComponent(
  context: RiveArtboardImportContext,
  index: number,
): DisplayObject | null {
  const object = context.artboard.objects[index];
  const node = createDisplayObject({ name: readRiveText(object, RIVE_NAME, '') });
  markRiveNestedArtboard(node, readRiveNumber(object, RIVE_NESTED_ARTBOARD_ID, -1));
  return node;
}

/**
 * Registers the file's assets and the drawables that reference content declared elsewhere in it: the
 * asset list itself, image drawables, and nested-artboard sites.
 *
 * The asset list is a document pass rather than a component importer because an asset is not a
 * component: it sits outside every artboard's numbering and is addressed by its position in the file.
 */
export function registerRiveAssetHandlers(registry: RiveImportRegistry): void {
  registerRiveCoreObjectHandler(registry, RIVE_FILE_ASSET, {
    applyDocument: (context) => {
      context.assets.push(...createRiveFileAssets(context.objects, context.diagnostics));
    },
  });
  registerRiveCoreObjectHandler(registry, RIVE_IMAGE, { importComponent: importRiveImageComponent });
  registerRiveCoreObjectHandler(registry, RIVE_NESTED_ARTBOARD, {
    importComponent: importRiveNestedArtboardComponent,
  });
  // A nested animation or state machine drives the artboard the site names; it is read with that
  // artboard rather than here, and contributes nothing to this one.
  registerRiveCoreObjectHandler(registry, RIVE_NESTED_ANIMATION, { importComponent: importRiveCoreObjectAsData });
}

function readRiveBytes(source: Readonly<RiveCoreObject>, key: number): Uint8Array | null {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || !(property.value instanceof Uint8Array) ? null : property.value;
}

function readRiveNumber(source: Readonly<RiveCoreObject>, key: number, fallback: number): number {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'number' ? fallback : property.value;
}

function readRiveText(source: Readonly<RiveCoreObject>, key: number, fallback: string): string {
  const property = source.properties.find((candidate) => candidate.key === key);
  return property === undefined || typeof property.value !== 'string' ? fallback : property.value;
}

const RIVE_NESTED_ARTBOARD = 92;
const RIVE_NESTED_ANIMATION = 93;
const RIVE_IMAGE = 100;
const RIVE_FILE_ASSET = 103;
const RIVE_FILE_ASSET_CONTENTS = 106;

const RIVE_NAME = 4;
const RIVE_NESTED_ARTBOARD_ID = 197;
const RIVE_ASSET_NAME = 203;
const RIVE_IMAGE_ASSET_ID = 206;
const RIVE_ASSET_HEIGHT = 207;
const RIVE_ASSET_WIDTH = 208;
const RIVE_ASSET_BYTES = 212;
const RIVE_ASSET_CDN_BASE_URL = 362;
