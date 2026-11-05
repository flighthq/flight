import type { HasBlendMode } from './contract.node-types.ts';

export function initBlendModeTrait(target: HasBlendMode, obj?: Readonly<Partial<HasBlendMode>>): void {
  target.blendMode = obj?.blendMode ?? null;
}
