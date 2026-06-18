import type { DisplayObject } from './DisplayObject';

/**
 * A display container that clips its content children to a mask. The mask is itself a display object
 * (shape, bitmap, …) added as a child of the group — so it inherits the group's transform and is owned
 * by it — but it is drawn into the stencil/clip instead of as visible content. Masking is the one
 * display feature that cannot batch, so it lives on its own kind rather than as a field on every node:
 * a mask-free tree never carries the mask field, the mask pass, or its renderer.
 */
export const MaskGroupKind: unique symbol = Symbol('MaskGroup');

export type MaskGroup = DisplayObject & {
  /** The child used as the clip mask, or null for no masking. Set via `setMaskGroupMask`. */
  mask: DisplayObject | null;
};
