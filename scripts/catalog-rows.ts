import {
  awd2CameraFamily,
  awd2GeometryFamily,
  awd2LightingFamily,
  awd2MaterialsFamily,
  awd2SceneStructureFamily,
  awd2SkeletonFamily,
} from '@flighthq/scene3d-formats';
import { AWD2_REQUIREMENT_KEY_NAMESPACE, getAwd2BlockName } from '@flighthq/scene3d-formats/contract';
import {
  swfBitmapTagFamily,
  swfControlTagFamily,
  swfFontTagFamily,
  swfPlacementTagFamily,
  swfScriptTagFamily,
  swfShapeTagFamily,
  swfSoundTagFamily,
  swfSpriteTagFamily,
  swfTextTagFamily,
  swfVideoTagFamily,
} from '@flighthq/swf';
import { getSwfTagName, SWF_REQUIREMENT_KEY_NAMESPACE } from '@flighthq/swf/contract';
import type { Awd2BlockHandler, RequirementCatalogEntry, SwfTagHandler } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

/**
 * The built-in ownership rows, DERIVED from the handlers themselves rather than transcribed.
 *
 * Every row answers one question factually: which shipped symbol does a build import to satisfy this
 * requirement? The tag and block codes are not written here — each family already declares the codes it
 * claims (`SwfTagHandler.tags`, `Awd2BlockHandler.blockTypes`), and the names come from the same
 * vocabulary the analyzers key their requirements with. So the catalog cannot drift from what the
 * families actually claim: a family that gains a tag gains a row on the next generate, and a row for a
 * tag no family claims cannot be written at all.
 *
 * ONLY THE PARSER BACKEND IS POPULATED, and that is a statement of fact rather than an omission. A
 * `document.format` requirement names a TAG (`swf.DefineShape`), while a node renderer is keyed by a
 * NODE KIND (`Shape`). Nothing in the repo declares which kinds a tag becomes — the relationship exists
 * only at runtime inside each family's `createPlacementNode` — so a canvas/gl/wgpu/dom row here would be
 * a guess, and a wrong one binds a renderer to a kind no node ever carries, which fails silently. Render
 * rows arrive when the format-to-render translation lands; see the catalog translation layer.
 *
 * The families are listed explicitly rather than swept out of the module namespace: the list is the
 * declaration of what ships, it greps, and `catalog-rows.test.ts` fails if it ever stops matching the
 * families the format packages actually export.
 */
export const SWF_TAG_FAMILIES: ReadonlyMap<string, readonly SwfTagHandler[]> = new Map([
  ['swfBitmapTagFamily', swfBitmapTagFamily],
  ['swfControlTagFamily', swfControlTagFamily],
  ['swfFontTagFamily', swfFontTagFamily],
  ['swfPlacementTagFamily', swfPlacementTagFamily],
  ['swfScriptTagFamily', swfScriptTagFamily],
  ['swfShapeTagFamily', swfShapeTagFamily],
  ['swfSoundTagFamily', swfSoundTagFamily],
  ['swfSpriteTagFamily', swfSpriteTagFamily],
  ['swfTextTagFamily', swfTextTagFamily],
  ['swfVideoTagFamily', swfVideoTagFamily],
]);

export const AWD2_BLOCK_FAMILIES: ReadonlyMap<string, readonly Awd2BlockHandler[]> = new Map([
  ['awd2CameraFamily', awd2CameraFamily],
  ['awd2GeometryFamily', awd2GeometryFamily],
  ['awd2LightingFamily', awd2LightingFamily],
  ['awd2MaterialsFamily', awd2MaterialsFamily],
  ['awd2SceneStructureFamily', awd2SceneStructureFamily],
  ['awd2SkeletonFamily', awd2SkeletonFamily],
]);

/** The backend whose rows become `parserOptions` rather than a render-state fragment. */
export const CATALOG_PARSER_BACKEND = 'parser';

/** Builds every built-in row, sorted so the generated source is byte-stable across runs. */
export function buildRequirementCatalogRows(): readonly RequirementCatalogEntry[] {
  const rows: RequirementCatalogEntry[] = [];
  for (const [symbol, family] of SWF_TAG_FAMILIES) {
    for (const handler of family) {
      for (const code of handler.tags) {
        rows.push(row('@flighthq/swf', symbol, `${SWF_REQUIREMENT_KEY_NAMESPACE}.${getSwfTagName(code)}`));
      }
    }
  }
  for (const [symbol, family] of AWD2_BLOCK_FAMILIES) {
    for (const handler of family) {
      for (const blockType of handler.blockTypes) {
        rows.push(
          row(
            '@flighthq/scene3d-formats',
            symbol,
            `${AWD2_REQUIREMENT_KEY_NAMESPACE}.${getAwd2BlockName(0, blockType)}`,
          ),
        );
      }
    }
  }
  return rows.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.implementationSymbol.localeCompare(b.implementationSymbol),
  );
}

// The PUBLIC lane, not `/contract`: these rows are emitted into a module an APPLICATION imports, and
// naming a tag family is exactly the app-level decision the public lane exists for.
function row(module: string, symbol: string, kind: string): RequirementCatalogEntry {
  return {
    backend: CATALOG_PARSER_BACKEND,
    facet: RequirementFacet.DocumentFormat,
    implementationImport: module,
    implementationSymbol: symbol,
    kind,
  };
}
