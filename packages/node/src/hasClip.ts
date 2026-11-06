import type { HasClip } from './types/HasClip.ts';

export function initClipTrait(target: HasClip, obj?: Readonly<Partial<HasClip>>): void {
  target.clip = obj?.clip ?? null;
}
