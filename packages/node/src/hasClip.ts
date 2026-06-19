import type { HasClip } from '@flighthq/types';

export function initClipTrait(target: HasClip, obj?: Readonly<Partial<HasClip>>): void {
  target.clip = obj?.clip ?? null;
}
