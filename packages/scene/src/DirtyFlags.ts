export enum DirtyFlags
{
  None = 0,

  /**
   * Object's local transform has changed.
   *
   * Indicates that local and world transform matrices must be updated.
   * May propagate to children, since their world transform depends on this object.
   *
   * Note: transform changes may also invalidate parent bounds.
   *
   * Common sources:
   *  - x, y
   *  - width, height
   *  - scaleX, scaleY
   *  - rotation
   *  - mask (can affect transform/bounds)
   */
  Transform = 1 << 0,

  /**
   * Object's appearance has changed.
   *
   * Indicates that the object must be re-rendered, but geometry may be unchanged.
   * Does not imply transform or layout recalculation.
   *
   * Common sources:
   *  - alpha
   *  - blendMode
   *  - visible
   *  - shader
   *  - scale9Grid
   *  - mask (affects how pixels are rendered)
   */
  Appearance = 1 << 1,

  /**
   * Object's effective bounds in its parent's coordinate space have changed.
   *
   * Indicates that cached bounds are no longer valid and must be
   * recomputed on access. May propagate upward to parents whose
   * bounds depend on this object.
   *
   * Common sources:
   *  - x, y
   *  - width, height
   *  - scaleX, scaleY
   *  - rotation
   *  - mask
   *  - visible
   */
  Bounds = 1 << 2,

  /**
   * Object's clipping region has changed.
   *
   * Indicates that clipping or masking state must be updated in the renderer.
   * May require transform updates depending on the rendering backend.
   *
   * Common sources:
   *  - scrollRect
   *  - mask
   */
  Clip = 1 << 3,

  /**
   * Cached rendering state has changed.
   *
   * Indicates that any bitmap or render-to-texture cache is invalid
   * and must be regenerated before rendering.
   *
   * Common sources:
   *  - cacheAsBitmap
   *  - cacheAsBitmapMatrix
   *  - filters
   */
  CacheAsBitmap = 1 << 4,

  /**
   * Display list structure has changed.
   *
   * Indicates that child addition or removal occurred, which may
   * affect traversal and cached bounds.
   */
  Children = 1 << 5,

  TransformedBounds = 1 << 6,

  Render = Transform | Appearance | Clip,
}

export namespace DirtyFlags
{
  /**
   * Returns true if any test flags are set
   */
  export function any(flags: DirtyFlags, test: DirtyFlags): boolean
  {
    return (flags & test) !== 0;
  }

  /**
   * Returns true if all test flags are set
   */
  export function has(flags: DirtyFlags, test: DirtyFlags): boolean
  {
    return (flags & test) === test;
  }

  export function add(flags: DirtyFlags, add: DirtyFlags): DirtyFlags
  {
    return flags | add;
  }

  export function remove(flags: DirtyFlags, remove: DirtyFlags): DirtyFlags
  {
    return flags & ~remove;
  }

  export function clear(): DirtyFlags
  {
    return DirtyFlags.None;
  }
}
