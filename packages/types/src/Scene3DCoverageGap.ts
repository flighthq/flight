import type { Kind } from './Entity';
import type { RenderRegistry } from './RenderRegistrySignals';

// How well a kind the scene uses is served by the registry that would have to serve it.
//   Fallback — something resolves, but not this kind's own implementation, so the content draws
//              differently than authored (a material with no renderer degrades to the standard one).
//   Missing  — nothing resolves; the content does not draw or resolve at all.
// A kind that is fully served produces no gap, so there is no `Covered` member to test against.
export const Scene3DCoverage = {
  Fallback: 'Fallback',
  Missing: 'Missing',
} as const;

export type Scene3DCoverage = (typeof Scene3DCoverage)[keyof typeof Scene3DCoverage];

// One kind a scene uses that its consumer is not fully wired for. The answer half of the seam whose
// question half is Scene3DKindUsage: a scene reports the kinds, and the package holding the registry
// reports which of them it cannot serve. `registry` reuses RenderRegistry so a gap is comparable with
// the misses `explainRenderRegistryMisses` records after the fact — the same vocabulary, asked before
// the frame instead of after it.
export interface Scene3DCoverageGap {
  readonly coverage: Scene3DCoverage;
  readonly kind: Kind;
  readonly registry: RenderRegistry;
}
