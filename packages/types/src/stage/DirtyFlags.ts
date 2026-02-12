export enum DirtyFlags {
  None = 0,
  Transform = 1 << 0,
  Appearance = 1 << 1,
  Bounds = 1 << 2,
  Clip = 1 << 3,
  CacheAsBitmap = 1 << 4,
  Children = 1 << 5,
  TransformedBounds = 1 << 6,

  Render = Transform | Appearance | Clip,
}

export default DirtyFlags;
