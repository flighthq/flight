import type { DomRenderOptions } from '@flighthq/types/contract';

/**
 * Composes DOM render-option fragments into one, field by field.
 *
 * Every field of `DomRenderOptions` is named explicitly. `mergeRenderOptions` in `@flighthq/render`
 * cannot serve here: it knows `RenderStateOptions`, which has no `textureResolvers` or
 * `shapeRasterizer`, so routing DOM fragments through it would silently drop the two fields that make
 * a DOM fragment a DOM fragment. Naming them means a new field on `DomRenderOptions` fails the
 * exhaustiveness test until someone decides how it composes.
 *
 * - **Kind-keyed maps merge**, later fragments winning per key, so two documents contributing
 *   different kinds both survive.
 * - **Scalars and nullable policy slots are last-wins.**
 * - **`undefined` never overwrites**, so a fragment silent about a field differs from one that sets
 *   it to null.
 *
 * Non-mutating: no input map is aliased into the result.
 */
export function mergeDomRenderOptions(
  ...options: readonly Readonly<Partial<DomRenderOptions>>[]
): Partial<DomRenderOptions> {
  const merged: { -readonly [K in keyof DomRenderOptions]: DomRenderOptions[K] } = {};
  for (const fragment of options) {
    if (fragment.canvasShapeCommands !== undefined) {
      merged.canvasShapeCommands = new Map([...(merged.canvasShapeCommands ?? []), ...fragment.canvasShapeCommands]);
    }
    if (fragment.effectPaddingResolvers !== undefined) {
      merged.effectPaddingResolvers = new Map([
        ...(merged.effectPaddingResolvers ?? []),
        ...fragment.effectPaddingResolvers,
      ]);
    }
    if (fragment.imageSmoothingEnabled !== undefined) merged.imageSmoothingEnabled = fragment.imageSmoothingEnabled;
    if (fragment.nodeRenderers !== undefined) {
      merged.nodeRenderers = new Map([...(merged.nodeRenderers ?? []), ...fragment.nodeRenderers]);
    }
    if (fragment.pixelRatio !== undefined) merged.pixelRatio = fragment.pixelRatio;
    if (fragment.roundPixels !== undefined) merged.roundPixels = fragment.roundPixels;
    if (fragment.sceneGraphSyncPolicy !== undefined) merged.sceneGraphSyncPolicy = fragment.sceneGraphSyncPolicy;
    if (fragment.shapeRasterizer !== undefined) merged.shapeRasterizer = fragment.shapeRasterizer;
    if (fragment.strokeTessellator !== undefined) merged.strokeTessellator = fragment.strokeTessellator;
    if (fragment.textureResolvers !== undefined) {
      merged.textureResolvers = new Map([...(merged.textureResolvers ?? []), ...fragment.textureResolvers]);
    }
  }
  return merged;
}
