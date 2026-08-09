import { reportImportDiagnostic } from '@flighthq/importdiagnostics/contract';
import type { ImportDiagnostic, RiveCoreObject, RiveFileAsset } from '@flighthq/types/contract';
import { ImportDiagnosticSeverity } from '@flighthq/types/contract';

import { getRiveCoreTypeName, isRiveCoreTypeDerivedFrom } from './riveCoreTypes';

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

const RIVE_FILE_ASSET = 103;
const RIVE_FILE_ASSET_CONTENTS = 106;

const RIVE_ASSET_NAME = 203;
const RIVE_ASSET_HEIGHT = 207;
const RIVE_ASSET_WIDTH = 208;
const RIVE_ASSET_BYTES = 212;
const RIVE_ASSET_CDN_BASE_URL = 362;
