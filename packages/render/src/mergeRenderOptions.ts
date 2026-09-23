import type { RenderStateOptions } from '@flighthq/types/contract';

/**
 * Composes render-state option fragments into one, field by field.
 *
 * Every field of `RenderStateOptions` is named explicitly rather than folded by a generic deep merge.
 * That is the point: a generic merge has to GUESS how an unfamiliar field composes, and it guesses
 * silently. Naming each field means adding one to `RenderStateOptions` without deciding how it merges
 * shows up as a compile error here and a failing exhaustiveness test, instead of as a field that
 * quietly takes the last fragment's value in someone's build.
 *
 * The three shapes compose differently, and the difference is load-bearing:
 *
 * - **Kind-keyed maps merge**, later fragments winning per key. Two content files naming different
 *   kinds must both survive; two naming the same kind agree.
 * - **Nullable policy functions are last-wins scalars.** A tessellator or a guard is one choice, not a
 *   collection, so the most recently stated fragment is the one the caller asked for.
 * - **`undefined` never overwrites.** A fragment that does not mention a field is silent about it, which
 *   is different from a fragment that sets it to null.
 *
 * Deterministic and non-mutating: no input map is aliased into the result, and the result depends only
 * on argument order.
 */
export function mergeRenderOptions(...options: readonly Readonly<RenderStateOptions>[]): RenderStateOptions {
  const merged: RenderStateOptions = {};
  for (const fragment of options) {
    if (fragment.canvasShapeCommands !== undefined) {
      merged.canvasShapeCommands = new Map([...(merged.canvasShapeCommands ?? []), ...fragment.canvasShapeCommands]);
    }
    if (fragment.colorAdjustments !== undefined) merged.colorAdjustments = fragment.colorAdjustments;
    if (fragment.colorAdjustmentUnsupportedGuard !== undefined) {
      merged.colorAdjustmentUnsupportedGuard = fragment.colorAdjustmentUnsupportedGuard;
    }
    if (fragment.effectPaddingResolvers !== undefined) {
      merged.effectPaddingResolvers = new Map([
        ...(merged.effectPaddingResolvers ?? []),
        ...fragment.effectPaddingResolvers,
      ]);
    }
    if (fragment.nodeRenderers !== undefined) {
      merged.nodeRenderers = new Map([...(merged.nodeRenderers ?? []), ...fragment.nodeRenderers]);
    }
    if (fragment.renderRootGuard !== undefined) merged.renderRootGuard = fragment.renderRootGuard;
    if (fragment.strokeTessellator !== undefined) merged.strokeTessellator = fragment.strokeTessellator;
  }
  return merged;
}
