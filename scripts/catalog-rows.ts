import {
  awd2CameraHandler,
  awd2ContainerHandler,
  awd2LightHandler,
  awd2LightPickerHandler,
  awd2MaterialHandler,
  awd2MeshInstanceHandler,
  awd2SkeletonAnimationHandler,
  awd2SkeletonBlockHandler,
  awd2SkeletonPoseHandler,
  awd2TextureHandler,
  awd2TriangleGeometryHandler,
} from '@flighthq/scene3d-formats';
import { AWD2_REQUIREMENT_KEY_NAMESPACE, getAwd2BlockName } from '@flighthq/scene3d-formats/contract';
import {
  swfControlHandler,
  swfDefineMorphShapeHandler,
  swfDefineShapeHandler,
  swfEditTextHandler,
  swfFontHandler,
  swfJpegBitmapHandler,
  swfLosslessBitmapHandler,
  swfPlaceObject3Handler,
  swfPlaceObjectHandler,
  swfScriptHandler,
  swfSoundHandler,
  swfSpriteHandler,
  swfStaticTextHandler,
  swfVideoHandler,
} from '@flighthq/swf';
import { getSwfTagName, SWF_REQUIREMENT_KEY_NAMESPACE } from '@flighthq/swf/contract';
import type { Awd2BlockHandler, RequirementCatalogEntry, SwfTagHandler } from '@flighthq/types/contract';
import { RequirementFacet } from '@flighthq/types/contract';

/**
 * The built-in ownership rows, DERIVED from the handlers themselves rather than transcribed.
 *
 * Every row answers one question factually: which shipped symbol does a build import to satisfy this
 * requirement? The tag and block codes are not written here — each handler already declares the codes
 * it claims (`SwfTagHandler.tags`, `Awd2BlockHandler.blockTypes`), and the names come from the same
 * vocabulary the analyzers key their requirements with. So the catalog cannot drift from what the
 * handlers actually claim: a handler that gains a tag gains a row on the next generate, and a row for a
 * tag no handler claims cannot be written at all.
 *
 * ★ ROWS NAME A HANDLER, NEVER A FAMILY. A family is a convenience array spanning several handlers, so
 * resolving `swf.DefineShape` to `swfShapeTagFamily` would also drag in the morph-shape handler, and
 * `swf.DefineText` would drag in the edit-text handler and the text-input machinery behind it. The
 * requirement is precise, so the answer must be too — otherwise resolution quietly re-inflates exactly
 * the cost the per-file manifest exists to avoid. AWD2 shows the same effect more sharply: its handlers
 * claim ONE block type each, so a family-shaped row for `awd2.Skeleton` would pull in skeleton POSE and
 * skeleton ANIMATION as well. The handler is the floor — it is the unit that owns a parse routine, and
 * the versioned tags one handler claims (`DefineShape` through `DefineShape4`) share that routine.
 *
 * ONLY THE PARSER BACKEND IS POPULATED, and that is a statement of fact rather than an omission. A
 * `document.format` requirement names a TAG (`swf.DefineShape`), while a node renderer is keyed by a
 * NODE KIND (`Shape`). Nothing in the repo declares which kinds a tag becomes — the relationship exists
 * only at runtime inside each handler's `createPlacementNode` — so a canvas/gl/wgpu/dom row here would
 * be a guess, and a wrong one binds a renderer to a kind no node ever carries, which fails silently.
 * Render rows arrive when the format-to-render translation lands.
 *
 * The handlers are listed explicitly rather than swept out of the module namespace: the list is the
 * declaration of what ships, it greps, and `catalog-rows.test.ts` fails if it ever stops matching the
 * handlers the format packages actually export.
 */
export const SWF_TAG_HANDLERS: ReadonlyMap<string, Readonly<SwfTagHandler>> = new Map([
  ['swfControlHandler', swfControlHandler],
  ['swfDefineMorphShapeHandler', swfDefineMorphShapeHandler],
  ['swfDefineShapeHandler', swfDefineShapeHandler],
  ['swfEditTextHandler', swfEditTextHandler],
  ['swfFontHandler', swfFontHandler],
  ['swfJpegBitmapHandler', swfJpegBitmapHandler],
  ['swfLosslessBitmapHandler', swfLosslessBitmapHandler],
  ['swfPlaceObject3Handler', swfPlaceObject3Handler],
  ['swfPlaceObjectHandler', swfPlaceObjectHandler],
  ['swfScriptHandler', swfScriptHandler],
  ['swfSoundHandler', swfSoundHandler],
  ['swfSpriteHandler', swfSpriteHandler],
  ['swfStaticTextHandler', swfStaticTextHandler],
  ['swfVideoHandler', swfVideoHandler],
]);

export const AWD2_BLOCK_HANDLERS: ReadonlyMap<string, Readonly<Awd2BlockHandler>> = new Map([
  ['awd2CameraHandler', awd2CameraHandler],
  ['awd2ContainerHandler', awd2ContainerHandler],
  ['awd2LightHandler', awd2LightHandler],
  ['awd2LightPickerHandler', awd2LightPickerHandler],
  ['awd2MaterialHandler', awd2MaterialHandler],
  ['awd2MeshInstanceHandler', awd2MeshInstanceHandler],
  ['awd2SkeletonAnimationHandler', awd2SkeletonAnimationHandler],
  ['awd2SkeletonBlockHandler', awd2SkeletonBlockHandler],
  ['awd2SkeletonPoseHandler', awd2SkeletonPoseHandler],
  ['awd2TextureHandler', awd2TextureHandler],
  ['awd2TriangleGeometryHandler', awd2TriangleGeometryHandler],
]);

/** The backend whose rows become `parserOptions` rather than a render-state fragment. */
export const CATALOG_PARSER_BACKEND = 'parser';

/** Builds every built-in row, sorted so the generated source is byte-stable across runs. */
export function buildRequirementCatalogRows(): readonly RequirementCatalogEntry[] {
  const rows: RequirementCatalogEntry[] = [];
  for (const [symbol, handler] of SWF_TAG_HANDLERS) {
    for (const code of handler.tags) {
      rows.push(row('@flighthq/swf', symbol, `${SWF_REQUIREMENT_KEY_NAMESPACE}.${getSwfTagName(code)}`));
    }
  }
  for (const [symbol, handler] of AWD2_BLOCK_HANDLERS) {
    for (const blockType of handler.blockTypes) {
      rows.push(
        row('@flighthq/scene3d-formats', symbol, `${AWD2_REQUIREMENT_KEY_NAMESPACE}.${getAwd2BlockName(0, blockType)}`),
      );
    }
  }
  return rows.sort(
    (a, b) => a.kind.localeCompare(b.kind) || a.implementationSymbol.localeCompare(b.implementationSymbol),
  );
}

// The PUBLIC lane, not `/contract`: these rows are emitted into a module an APPLICATION imports, and
// naming a tag handler is exactly the app-level decision the public lane exists for.
function row(module: string, symbol: string, kind: string): RequirementCatalogEntry {
  return {
    backend: CATALOG_PARSER_BACKEND,
    facet: RequirementFacet.DocumentFormat,
    implementationImport: module,
    implementationSymbol: symbol,
    kind,
  };
}
