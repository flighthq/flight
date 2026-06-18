import type { HasClipRectangle } from '@flighthq/types';

export function initClipRectangleTrait(target: HasClipRectangle, obj?: Readonly<Partial<HasClipRectangle>>): void {
  target.clipRectangle = obj?.clipRectangle ?? null;
}
