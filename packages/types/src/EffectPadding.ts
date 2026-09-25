import type { Effect } from './Effect.ts';
import type { Kind } from './Entity.ts';

export interface EffectPadding {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

export type EffectPaddingResolver = (effect: Readonly<Effect>) => Readonly<EffectPadding>;

export type EffectPaddingStatus = 'complete' | 'missing-resolver';

export interface EffectPaddingExplanation {
  readonly missingKinds: ReadonlyArray<Kind>;
  readonly padding: Readonly<EffectPadding>;
  readonly status: EffectPaddingStatus;
}
