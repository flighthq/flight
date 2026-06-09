export enum RenderFeatures {
  None = 0,
  BlendMode = 1 << 0,
  ColorTransform = 1 << 1,
  Masks = 1 << 2,
  ClipRectangle = 1 << 3,
  Shaders = 1 << 4,
  CSSFilter = 1 << 5,

  All = BlendMode | ColorTransform | Masks | ClipRectangle | Shaders | CSSFilter,
}

export namespace RenderFeatures {
  export function add(flags: RenderFeatures, add: RenderFeatures): RenderFeatures {
    return flags | add;
  }

  export function has(flags: RenderFeatures, test: RenderFeatures): boolean {
    return (flags & test) === test;
  }

  export function remove(flags: RenderFeatures, remove: RenderFeatures): RenderFeatures {
    return flags & ~remove;
  }
}
