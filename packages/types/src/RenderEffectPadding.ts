import type { Kind } from './Entity';
import type { RenderEffect } from './RenderEffect';

export interface RenderEffectPadding {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export type RenderEffectPaddingResolver = (effect: Readonly<RenderEffect>) => Readonly<RenderEffectPadding>;

export type RenderEffectPaddingStatus = 'complete' | 'missing-resolver';

export interface RenderEffectPaddingExplanation {
  readonly missingKinds: ReadonlyArray<Kind>;
  readonly padding: Readonly<RenderEffectPadding>;
  readonly status: RenderEffectPaddingStatus;
}
