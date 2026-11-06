import type { Kind } from '@flighthq/entity/contract';
import type { EffectPadding } from '@flighthq/render/contract';

export type EffectPaddingStatus = 'complete' | 'missing-resolver';

export interface EffectPaddingExplanation {
  readonly missingKinds: ReadonlyArray<Kind>;
  readonly padding: Readonly<EffectPadding>;
  readonly status: EffectPaddingStatus;
}
