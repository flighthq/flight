import type { CompositeEffect, CompositeOperator } from '@flighthq/types';

// Porter-Duff composite effect: merges the incoming pipeline layer over a registered backdrop with a
// coverage operator (the CompositeOperator vocabulary — Erase = DestinationOut, Alpha = DestinationIn,
// and the rest of the set). `operator` is required; `backdropKey` names the per-state backdrop texture the
// backend samples. It is the cheap sibling of createBlendEffect: a fixed-function coverage combine rather
// than a shader blend, but still an explicit effect because a non-source-over operator is only meaningful
// against an isolated layer.
export function createCompositeEffect(
  operator: CompositeOperator,
  options: Readonly<Omit<CompositeEffect, 'kind' | 'operator'>> = {},
): CompositeEffect {
  return { kind: 'CompositeEffect', operator, ...options };
}
