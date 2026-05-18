export enum AppearanceFlags {
  None = 0,
  Visible = 1 << 0,
  Alpha = 1 << 1,
  BlendMode = 1 << 2,
  ScrollRect = 1 << 3,
  Scale9Grid = 1 << 4,
  Mask = 1 << 5,
  CacheAsBitmap = 1 << 6,
  Filters = 1 << 7,

  Any = 1 << 31,
}

export namespace AppearanceFlags {
  /**
   * Returns true if any test flags are set
   */
  export function any(flags: AppearanceFlags, test: AppearanceFlags): boolean {
    return (flags & test) !== 0;
  }

  /**
   * Returns true if all test flags are set
   */
  export function has(flags: AppearanceFlags, test: AppearanceFlags): boolean {
    return (flags & test) === test;
  }

  export function add(flags: AppearanceFlags, add: AppearanceFlags): AppearanceFlags {
    return flags | add;
  }

  export function remove(flags: AppearanceFlags, remove: AppearanceFlags): AppearanceFlags {
    return flags & ~remove;
  }

  export function clear(): AppearanceFlags {
    return AppearanceFlags.None;
  }
}
