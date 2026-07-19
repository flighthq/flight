import type { CompositeOperator } from './CompositeOperator';
import type { RenderEffect } from './RenderEffect';

// Merge this node's isolated layer into its parent with a Porter-Duff coverage operator instead of the
// default source-over. Unlike BlendEffect (which samples a backdrop and runs blend math in a shader), a
// composite operator is a fixed-function coverage combine — no shader, no non-separable math. Its cost is
// the isolation layer itself, not an extra pass: the pipeline renders the group to a layer (`source`),
// then composites it over the backdrop with the operator's `Fa*source + Fb*backdrop` factors. The backdrop
// is a per-state registered texture referenced by `backdropKey`, mirroring BlendEffect — a live GPU
// texture cannot live in serializable data, so the intent carries the key and the backend resolves it. An
// unregistered key composites over an implicit transparent backdrop (which reduces most operators to a
// passthrough or clear) rather than erroring.
export interface CompositeEffect extends RenderEffect {
  kind: 'CompositeEffect';
  operator: CompositeOperator;
  backdropKey?: string;
}
