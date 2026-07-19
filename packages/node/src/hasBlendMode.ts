import type { HasBlendMode } from '@flighthq/types';

export function initBlendModeTrait(target: HasBlendMode, obj?: Readonly<Partial<HasBlendMode>>): void {
  target.blendMode = obj?.blendMode ?? null;
}
